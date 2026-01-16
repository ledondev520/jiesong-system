'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Store } from '@/types';
import { PORTS } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const storeSchema = z.object({
  name: z.string().min(1, 'Store Name is required'),
  portId: z.string().min(1, 'Port is required'),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
});

type StoreFormValues = z.infer<typeof storeSchema>;

interface StoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store?: Store | null;
  onSubmit: (data: any) => Promise<void>;
}

export function StoreDialog({
  open,
  onOpenChange,
  store,
  onSubmit,
}: StoreDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      portId: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      address: '',
    },
    values: store ? {
      name: store.name,
      portId: store.portId,
      contactName: store.contactName || '',
      contactPhone: store.contactPhone || '',
      contactEmail: store.contactEmail || '',
      address: store.address || '',
    } : undefined,
  });

  const handleSubmit = async (data: StoreFormValues) => {
    await onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{store ? 'Edit Store' : 'Add Store'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Store Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="portId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a port" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PORTS.map((port) => (
                        <SelectItem key={port.id} value={port.id}>
                          {port.name} ({port.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Phone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit">Save Store</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
