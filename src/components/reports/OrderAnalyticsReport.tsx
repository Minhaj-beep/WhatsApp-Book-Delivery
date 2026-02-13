import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { TrendingUp, Package, DollarSign, CheckCircle } from 'lucide-react';

interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  completedOrders: number;
  ordersByStatus: { status: string; count: number }[];
  ordersByPayment: { payment_status: string; count: number }[];
  recentOrders: any[];
}

export default function OrderAnalyticsReport() {
  const [stats, setStats] = useState<OrderStats>({
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    completedOrders: 0,
    ordersByStatus: [],
    ordersByPayment: [],
    recentOrders: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*, schools(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const totalRevenue = orders?.reduce((sum, o) =>
        o.payment_status === 'paid' ? sum + o.total_amount_paise : sum, 0
      ) || 0;

      const statusCounts: { [key: string]: number } = {};
      const paymentCounts: { [key: string]: number } = {};

      orders?.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        paymentCounts[order.payment_status] = (paymentCounts[order.payment_status] || 0) + 1;
      });

      setStats({
        totalOrders: orders?.length || 0,
        totalRevenue,
        avgOrderValue: orders && orders.length > 0 ? totalRevenue / orders.length : 0,
        completedOrders: orders?.filter(o => o.status === 'delivered').length || 0,
        ordersByStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
        ordersByPayment: Object.entries(paymentCounts).map(([payment_status, count]) => ({
          payment_status,
          count
        })),
        recentOrders: orders?.slice(0, 5) || [],
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-48"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-slate-900">Order Analytics</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Total Orders</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{stats.totalOrders}</p>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-900">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-green-900">{formatCurrency(stats.totalRevenue)}</p>
        </div>

        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-900">Avg Order Value</span>
          </div>
          <p className="text-2xl font-bold text-yellow-900">{formatCurrency(stats.avgOrderValue)}</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-slate-600" />
            <span className="text-sm font-medium text-slate-900">Completed</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.completedOrders}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Orders by Status</h3>
          <div className="space-y-2">
            {stats.ordersByStatus.map(({ status, count }) => (
              <div key={status} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium text-slate-700 capitalize">
                  {status.replace('_', ' ')}
                </span>
                <span className="text-sm font-bold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Payment Status</h3>
          <div className="space-y-2">
            {stats.ordersByPayment.map(({ payment_status, count }) => (
              <div key={payment_status} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium text-slate-700 capitalize">
                  {payment_status}
                </span>
                <span className="text-sm font-bold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Recent Orders</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Order ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">School</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stats.recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">#{order.id.toString().slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">{order.schools?.name || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">
                    {formatCurrency(order.total_amount_paise)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                      order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
