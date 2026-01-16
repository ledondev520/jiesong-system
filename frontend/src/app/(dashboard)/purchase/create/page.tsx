'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PurchaseStatus, Product, Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Wand2, Plus, Trash, Upload, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseService } from '@/services/purchase.service';
import { supplierService } from '@/services/supplier.service';
import { productService } from '@/services/product.service';

const purchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  contractNo: z.string().optional(), // Auto-generated if empty
  signedAt: z.date().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, 'Product is required'),
    quantity: z.coerce.number().min(0.01, 'Qty required'),
    unitPrice: z.coerce.number().min(0, 'Price required'),
    unit: z.string().optional(),
    note: z.string().optional(),
  })).min(1, 'At least one item is required'),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export default function CreatePurchasePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseText, setParseText] = useState('');

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierId: '',
      contractNo: 'CG25' + Math.floor(Math.random() * 10000), // Mock Auto-gen
      signedAt: new Date(),
      note: '',
      items: [{ productId: '', quantity: 0, unitPrice: 0, unit: '', note: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchItems = useWatch({ control: form.control, name: 'items' });

  // Calculate Total
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  useEffect(() => {
    // Load Dependencies
    const loadData = async () => {
      // Mock loading
      setSuppliers([
        { id: '1', name: 'Foshan Ceramic', hasQualityIssue: false, isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', name: 'GZ Sanitary', hasQualityIssue: true, isActive: true, createdAt: '', updatedAt: '' },
      ]);
      setProducts([
        { id: '1', customsName: 'Porcelain Tiles', unit: 'sqm', isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', customsName: 'Wash Basin', unit: 'pcs', isActive: true, createdAt: '', updatedAt: '' },
      ]);
    };
    loadData();
  }, []);

  const handleParse = async () => {
    if (!parseText) return;
    setIsParsing(true);
    try {
      // Mock Parse
      const result: any = await purchaseService.parseQuote(parseText);
      if (result.success) {
        // Append parsed items
        result.data.forEach((item: any) => {
          append({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit,
            note: item.note,
          });
        });
        toast.success('Quote parsed successfully!');
        setParseText('');
      }
    } catch (e) {
      toast.error('Failed to parse text');
    } finally {
      setIsParsing(false);
    }
  };

  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      // await purchaseService.create(data);
      toast.success('Purchase Contract Created');
      router.push('/purchase');
    } catch (error) {
      toast.error('Failed to create contract');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Purchase Contract</h2>
          <p className="text-muted-foreground">Fill in the details below or use AI to parse a quote.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-purple-500" />
              AI Quick Input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              placeholder="Paste supplier quote here (e.g. '100 sqm Tiles at 45 RMB/sqm from Foshan Ceramic...')" 
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
              className="min-h-[100px]"
            />
            <Button 
              onClick={handleParse} 
              disabled={isParsing || !parseText}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isParsing ? 'Parsing...' : 'Parse Quote'}
            </Button>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Contract Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="contractNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract No</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormDescription>Auto-generated</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="signedAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="mb-1.5">Date Signed</FormLabel>
                      <DatePicker date={field.value} setDate={field.onChange} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="md:col-span-3">
                   <FormLabel>Contract File</FormLabel>
                   <div className="mt-2 border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                      <Upload className="h-8 w-8 mb-2" />
                      <span className="text-sm">Click to upload PDF or Image (Max 50MB)</span>
                      <input type="file" className="hidden" accept=".pdf,image/*" />
                   </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Purchase Items</CardTitle>
                <div className="text-lg font-bold">
                  Total: ¥{totalAmount.toLocaleString()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 md:grid-cols-12 items-end border-b pb-4">
                    <div className="md:col-span-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Product</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Product" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {products.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.customsName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Quantity</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.unit`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Unit</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Price (¥)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="md:col-span-1 text-right pb-2 font-medium">
                      ¥{((watchItems[index]?.quantity || 0) * (watchItems[index]?.unitPrice || 0)).toLocaleString()}
                    </div>

                    <div className="md:col-span-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button type="button" variant="outline" onClick={() => append({ productId: '', quantity: 0, unitPrice: 0, unit: '', note: '' })}>
                  <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
              </CardContent>
            </Card>

            <div className="md:col-span-2 flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" size="lg">Create Contract</Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
