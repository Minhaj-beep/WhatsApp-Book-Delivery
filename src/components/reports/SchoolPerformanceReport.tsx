import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { School, TrendingUp, Package } from 'lucide-react';

interface SchoolPerformance {
  school_id: string;
  school_name: string;
  school_code: string;
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  active: boolean;
}

export default function SchoolPerformanceReport() {
  const [performance, setPerformance] = useState<SchoolPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPerformance();
  }, []);

  async function loadPerformance() {
    try {
      const { data: schools, error: schoolsError } = await supabase
        .from('schools')
        .select('id, name, code_4digit, active');

      if (schoolsError) throw schoolsError;

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('school_id, total_amount_paise, payment_status');

      if (ordersError) throw ordersError;

      const performanceData: SchoolPerformance[] = schools?.map(school => {
        const schoolOrders = orders?.filter(o => o.school_id === school.id) || [];
        const paidOrders = schoolOrders.filter(o => o.payment_status === 'paid');
        const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total_amount_paise, 0);

        return {
          school_id: school.id,
          school_name: school.name,
          school_code: school.code_4digit,
          total_orders: schoolOrders.length,
          total_revenue: totalRevenue,
          avg_order_value: schoolOrders.length > 0 ? totalRevenue / schoolOrders.length : 0,
          active: school.active,
        };
      }) || [];

      performanceData.sort((a, b) => b.total_revenue - a.total_revenue);
      setPerformance(performanceData);
    } catch (error) {
      console.error('Error loading performance:', error);
    } finally {
      setLoading(false);
    }
  }

  const topSchool = performance[0];
  const totalSchools = performance.length;
  const activeSchools = performance.filter(p => p.active).length;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-48"></div>
        <div className="h-32 bg-slate-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <School className="w-6 h-6 text-slate-900" />
        <h2 className="text-xl font-bold text-slate-900">School Performance</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <School className="w-5 h-5 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Total Schools</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalSchools}</p>
          <p className="text-xs text-slate-600 mt-1">{activeSchools} active</p>
        </div>

        {topSchool && (
          <>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">Top School</span>
              </div>
              <p className="text-lg font-bold text-green-900">{topSchool.school_name}</p>
              <p className="text-xs text-green-700 mt-1">
                {formatCurrency(topSchool.total_revenue)} revenue
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Most Orders</span>
              </div>
              <p className="text-lg font-bold text-blue-900">{topSchool.school_name}</p>
              <p className="text-xs text-blue-700 mt-1">{topSchool.total_orders} orders</p>
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Performance by School</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">School</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Orders</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Revenue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Avg Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {performance.map((school, index) => (
                <tr key={school.school_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-yellow-100 text-yellow-800' :
                      index === 1 ? 'bg-slate-200 text-slate-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {school.school_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{school.school_code}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">{school.total_orders}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                    {formatCurrency(school.total_revenue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatCurrency(school.avg_order_value)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      school.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {school.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {performance.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <School className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No school data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
