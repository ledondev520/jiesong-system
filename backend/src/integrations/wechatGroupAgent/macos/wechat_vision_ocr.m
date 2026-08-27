#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <Vision/Vision.h>

static void fail(NSString *message) {
    fprintf(stderr, "wechat-vision-ocr: %s\n", message.UTF8String);
    exit(1);
}

static CGImageRef loadImage(NSString *path, NSImage **retainedImage) {
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:path];
    if (image == nil) fail([NSString stringWithFormat:@"unable to load image: %@", path]);
    NSRect rect = NSMakeRect(0, 0, image.size.width, image.size.height);
    CGImageRef cgImage = [image CGImageForProposedRect:&rect context:nil hints:nil];
    if (cgImage == nil) fail([NSString stringWithFormat:@"unable to decode image: %@", path]);
    *retainedImage = image;
    return cgImage;
}

static CGImageRef captureWechatWindow(void) {
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block CGImageRef capturedImage = nil;
    __block NSString *failure = nil;

    [SCShareableContent getShareableContentExcludingDesktopWindows:YES
        onScreenWindowsOnly:YES
        completionHandler:^(SCShareableContent *content, NSError *error) {
            if (error != nil || content == nil) {
                failure = error.localizedDescription ?: @"unable to read shareable windows";
                dispatch_semaphore_signal(semaphore);
                return;
            }

            SCWindow *bestWindow = nil;
            CGFloat bestArea = 0;
            for (SCWindow *window in content.windows) {
                NSString *owner = window.owningApplication.applicationName ?: @"";
                BOOL isWechat = [owner localizedCaseInsensitiveContainsString:@"wechat"] || [owner containsString:@"微信"];
                CGFloat area = window.frame.size.width * window.frame.size.height;
                if (window.windowLayer == 0 && window.isOnScreen && isWechat &&
                    window.frame.size.width >= 500 && window.frame.size.height >= 400 && area > bestArea) {
                    bestWindow = window;
                    bestArea = area;
                }
            }
            if (bestWindow == nil) {
                failure = @"visible WeChat window not found";
                dispatch_semaphore_signal(semaphore);
                return;
            }

            SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:bestWindow];
            SCStreamConfiguration *configuration = [[SCStreamConfiguration alloc] init];
            CGFloat scale = MAX(filter.pointPixelScale, 1.0);
            configuration.width = (size_t)MAX(bestWindow.frame.size.width * scale, 1.0);
            configuration.height = (size_t)MAX(bestWindow.frame.size.height * scale, 1.0);
            configuration.showsCursor = NO;
            configuration.ignoreShadowsSingleWindow = YES;
            [SCScreenshotManager captureImageWithFilter:filter
                configuration:configuration
                completionHandler:^(CGImageRef image, NSError *captureError) {
                    if (image != nil) capturedImage = CGImageRetain(image);
                    if (captureError != nil) failure = captureError.localizedDescription;
                    dispatch_semaphore_signal(semaphore);
                }];
        }];

    if (dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC)) != 0) {
        fail(@"timed out while capturing WeChat window");
    }
    if (capturedImage == nil) {
        fail([NSString stringWithFormat:@"unable to capture WeChat window: %@; Screen Recording permission may be required",
            failure ?: @"unknown error"]);
    }
    return capturedImage;
}

static NSDictionary *recognize(CGImageRef image, NSString *source) {
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;
    request.recognitionLanguages = @[@"zh-Hans", @"en-US"];

    NSError *error = nil;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
    if (![handler performRequests:@[request] error:&error]) {
        fail([NSString stringWithFormat:@"Vision OCR failed: %@", error.localizedDescription]);
    }

    NSMutableArray *observations = [NSMutableArray array];
    for (VNRecognizedTextObservation *item in request.results ?: @[]) {
        VNRecognizedText *candidate = [[item topCandidates:1] firstObject];
        if (candidate == nil) continue;
        CGRect box = item.boundingBox;
        [observations addObject:@{
            @"text": candidate.string,
            @"confidence": @(candidate.confidence),
            @"boundingBox": @{
                @"x": @(box.origin.x),
                @"y": @(box.origin.y),
                @"width": @(box.size.width),
                @"height": @(box.size.height),
            },
        }];
    }

    NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
    return @{
        @"source": source,
        @"capturedAt": [formatter stringFromDate:[NSDate date]],
        @"observations": observations,
    };
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
        if (argc == 3 && strcmp(argv[1], "--image") == 0) {
            NSImage *retainedImage = nil;
            CGImageRef image = loadImage([NSString stringWithUTF8String:argv[2]], &retainedImage);
            NSData *json = [NSJSONSerialization dataWithJSONObject:recognize(image, @"image-file") options:0 error:nil];
            fwrite(json.bytes, 1, json.length, stdout);
            fwrite("\n", 1, 1, stdout);
            (void)retainedImage;
            return 0;
        }
        if (argc == 2 && strcmp(argv[1], "--wechat-window") == 0) {
            CGImageRef image = captureWechatWindow();
            NSData *json = [NSJSONSerialization dataWithJSONObject:recognize(image, @"wechat-window") options:0 error:nil];
            CGImageRelease(image);
            fwrite(json.bytes, 1, json.length, stdout);
            fwrite("\n", 1, 1, stdout);
            return 0;
        }
        fail(@"usage: wechat-vision-ocr --image /absolute/path.png | --wechat-window");
    }
}
