'use client';

import { useState, useEffect } from 'react';
import { Supplier } from '@/types';
// import { supplierService } from '@/services/supplier.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash, AlertTriangle } from 'lucide-react';
import { SupplierDialog } from './components/SupplierDialog';
import { toast } from 'sonner';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setSuppliers([
        { 
          id: '1', 
          name: 'Foshan Ceramic Co., Ltd', 
          shortName: 'Foshan Ceramic', 
          contactName: 'Mr. Li', 
          hasQualityIssue: false, 
          isActive: true, 
          createdAt: '', 
          updatedAt: '',
          aliases: [{ id: 'a1', alias: 'Li Zong', supplierId: '1', createdAt: '' }]
        },
        { 
          id: '2', 
          name: 'Guangzhou Sanitary Ware', 
          shortName: 'GZ Sanitary', 
          hasQualityIssue: true, 
          qualityNote: 'Cracked sinks in last shipment',
          isActive: true, 
          createdAt: '', 
          updatedAt: '' 
        },
      ]);
    } catch (error) {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSupplier(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this supplier?')) {
      setSuppliers(suppliers.filter(s => s.id !== id));
      toast.success('Supplier deleted');
    }
  };

  const handleSubmit = async (data: any) => {
    // Simulate API call
    if (editingSupplier) {
      setSuppliers(suppliers.map(s => s.id === editingSupplier.id ? { ...s, ...data, id: s.id } : s));
      toast.success('Supplier updated successfully');
    } else {
      setSuppliers([...suppliers, { id: Math.random().toString(), ...data, isActive: true, createdAt: '', updatedAt: '' }]);
      toast.success('Supplier created successfully');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Suppliers</h2>
          <p className="text-muted-foreground">Manage suppliers and quality records.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Aliases</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Quality Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">Loading...</TableCell>
               </TableRow>
            ) : suppliers.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">No suppliers found.</TableCell>
               </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div className="font-medium">{supplier.name}</div>
                    {supplier.shortName && <div className="text-xs text-muted-foreground">{supplier.shortName}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {supplier.aliases?.map(a => (
                        <Badge key={a.id} variant="secondary" className="text-xs">{a.alias}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{supplier.contactName}</div>
                    <div className="text-xs text-muted-foreground">{supplier.contactPhone}</div>
                  </TableCell>
                  <TableCell>
                    {supplier.hasQualityIssue ? (
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">Issue Reported</span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Good</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(supplier)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier.id)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        supplier={editingSupplier}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
