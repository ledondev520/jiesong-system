'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Product, Store } from '@/types';
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
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, Trash, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { salesService } from '@/services/sales.service';
import { productService } from '@/services/product.service';
import { storeService } from '@/services/store.service';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE } from '@/lib/constants';

const salesSchema = z.object({
  contractNo: z.string().optional(),
  signedAt: z.date().optional(),
  exchangeRate: z.coerce.number().min(0.1),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, 'Product is required'),
    storeId: z.string().min(1, 'Store is required'),
    quantity: z.coerce.number().min(0.01, 'Qty required'),
    unit: z.string().optional(),
    costPrice: z.coerce.number().min(0, 'Cost required'),
    sellingPrice: z.coerce.number().min(0, 'Price required'),
    note: z.string().optional(),
  })).min(1, 'At least one item is required'),
});

type SalesFormValues = z.infer<typeof salesSchema>;

export default function CreateSalesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  const form = useForm<SalesFormValues>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      contractNo: 'EXP25' + Math.floor(Math.random() * 10000),
      signedAt: new Date(),
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      note: '',
      items: [{ productId: '', storeId: '', quantity: 0, unit: '', costPrice: 0, sellingPrice: 0, note: '' }],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchItems = useWatch({ control: form.control, name: 'items' });
  const exchangeRate = useWatch({ control: form.control, name: 'exchangeRate' });

  // Calculate Total
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.sellingPrice) || 0);
  }, 0);

  useEffect(() => {
    const loadData = async () => {
      // Mock loading
      setProducts([
        { id: '1', customsName: 'Porcelain Tiles', unit: 'sqm', isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', customsName: 'Wash Basin', unit: 'pcs', isActive: true, createdAt: '', updatedAt: '' },
      ]);
      setStores([
         { id: '1', name: 'Ceritos Store', portId: '1', isActive: true, createdAt: '', updatedAt: '' },
         { id: '2', name: 'Anaheim Store', portId: '1', isActive: true, createdAt: '', updatedAt: '' },
      ]);
    };
    loadData();
  }, []);

  // Auto-calculate selling price when cost price changes
  const handleCostChange = (index: number, cost: number) => {
    const price = salesService.calculatePrice(cost, exchangeRate, DEFAULT_PROFIT_RATE);
    // We need to update the form value for sellingPrice
    const currentItem = form.getValues(`items.${index}`);
    update(index, { ...currentItem, costPrice: cost, sellingPrice: price });
  };

  const onSubmit = async (data: SalesFormValues) => {
    try {
      // await salesService.create(data);
      toast.success('Sales Contract Created');
      router.push('/sales');
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
          <h2 className="text-3xl font-bold tracking-tight">Create Export Contract</h2>
          <p className="text-muted-foreground">Create new sales contract and calculate pricing.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <Card>
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
                name="signedAt"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-1.5">Date Signed</FormLabel>
                    <DatePicker date={field.value} setDate={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="exchangeRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exchange Rate</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormDescription>Default: {DEFAULT_EXCHANGE_RATE}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sales Items</CardTitle>
              <div className="text-lg font-bold">
                Total: ${totalAmount.toLocaleString()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="grid gap-4 md:grid-cols-12 items-end border-b pb-4">
                  <div className="md:col-span-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.productId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>Product</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Product" />
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

                  <div className="md:col-span-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.storeId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>Store</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Store" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {stores.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                      name={`items.${index}.costPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>Cost (¥)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => handleCostChange(index, parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.sellingPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>Price ($)</FormLabel>
                          <div className="flex gap-2">
                             <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
              
              <Button type="button" variant="outline" onClick={() => append({ productId: '', storeId: '', quantity: 0, unit: '', costPrice: 0, sellingPrice: 0, note: '' })}>
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" size="lg">Create Contract</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
