import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DashboardStats } from '../types/database';
import { formatCurrency } from '../lib/utils';
import { Package, DollarSign, Truck, AlertCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    pending_payments: 0,
    confirmed_orders: 0,
    out_for_delivery: 0,
    total_orders_today: 0,
    total_revenue_today_paise: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: orders, error } = await supabase
        .from('orders')
        .select('status, payment_status, total_amount_paise, created_at');

      if (error) throw error;

      const todayOrders = orders?.filter(o =>
        new Date(o.created_at) >= today
      ) || [];

      setStats({
        pending_payments: orders?.filter(o => o.payment_status === 'pending').length || 0,
        confirmed_orders: orders?.filter(o => o.status === 'confirmed').length || 0,
        out_for_delivery: orders?.filter(o => o.status === 'out_for_delivery').length || 0,
        total_orders_today: todayOrders.length,
        total_revenue_today_paise: todayOrders
          .filter(o => o.payment_status === 'paid')
          .reduce((sum, o) => sum + o.total_amount_paise, 0),
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      title: 'Pending Payments',
      value: stats.pending_payments,
      icon: AlertCircle,
      color: 'bg-yellow-500',
    },
    {
      title: 'Orders to Pack',
      value: stats.confirmed_orders,
      icon: Package,
      color: 'bg-blue-500',
    },
    {
      title: 'Out for Delivery',
      value: stats.out_for_delivery,
      icon: Truck,
      color: 'bg-green-500',
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(stats.total_revenue_today_paise),
      icon: DollarSign,
      color: 'bg-slate-900',
    },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">Overview of your ordering system</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-slate-600 text-sm font-medium mb-1">{card.title}</h3>
              <p className="text-3xl font-bold text-slate-900">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border-2 border-slate-200 rounded-lg hover:border-slate-900 transition text-left">
            <h3 className="font-semibold text-slate-900 mb-1">View Pending Orders</h3>
            <p className="text-sm text-slate-600">Review and process new orders</p>
          </button>
          <button className="p-4 border-2 border-slate-200 rounded-lg hover:border-slate-900 transition text-left">
            <h3 className="font-semibold text-slate-900 mb-1">Add New School</h3>
            <p className="text-sm text-slate-600">Register a new school in the system</p>
          </button>
          <button className="p-4 border-2 border-slate-200 rounded-lg hover:border-slate-900 transition text-left">
            <h3 className="font-semibold text-slate-900 mb-1">Manage Inventory</h3>
            <p className="text-sm text-slate-600">Update items and stock levels</p>
          </button>
        </div>
      </div>
    </div>
  );
}
