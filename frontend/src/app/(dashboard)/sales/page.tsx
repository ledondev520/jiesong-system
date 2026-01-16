'use client';

import { useState, useEffect } from 'react';
import { SalesContract, SalesStatus } from '@/types';
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
import { Plus, Eye, FileText, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function SalesPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    setLoading(true);
    try {
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setContracts([
        { 
          id: '1', 
          contractNo: 'EXP250001', 
          totalAmount: 15000,
          receivedAmount: 15000,
          exchangeRate: 6.8,
          status: SalesStatus.PAID,
          signedAt: new Date().toISOString(),
          createdAt: '', 
          updatedAt: '' 
        },
        { 
          id: '2', 
          contractNo: 'EXP250002', 
          totalAmount: 8500,
          receivedAmount: 0,
          exchangeRate: 6.8,
          status: SalesStatus.CONFIRMED,
          signedAt: new Date().toISOString(),
          createdAt: '', 
          updatedAt: '' 
        },
      ]);
    } catch (error) {
      toast.error('Failed to load sales contracts');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: SalesStatus) => {
    switch (status) {
      case SalesStatus.DRAFT: return <Badge variant="outline">Draft</Badge>;
      case SalesStatus.CONFIRMED: return <Badge className="bg-blue-500">Confirmed</Badge>;
      case SalesStatus.PAID: return <Badge className="bg-green-500">Paid</Badge>;
      case SalesStatus.SHIPPED: return <Badge className="bg-purple-500">Shipped</Badge>;
      case SalesStatus.COMPLETED: return <Badge className="bg-gray-500">Completed</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Contracts</h2>
          <p className="text-muted-foreground">Manage export contracts and revenue.</p>
        </div>
        <Button onClick={() => router.push('/sales/create')}>
          <Plus className="mr-2 h-4 w-4" /> New Export Contract
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contract No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total Amount ($)</TableHead>
              <TableHead className="text-right">Received ($)</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10">Loading...</TableCell>
               </TableRow>
            ) : contracts.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10">No contracts found.</TableCell>
               </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {contract.contractNo}
                  </TableCell>
                  <TableCell>{contract.signedAt ? format(new Date(contract.signedAt), 'MMM dd, yyyy') : '-'}</TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell className="text-right">${contract.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={contract.receivedAmount < contract.totalAmount ? 'text-yellow-600' : 'text-green-600'}>
                      ${contract.receivedAmount.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
