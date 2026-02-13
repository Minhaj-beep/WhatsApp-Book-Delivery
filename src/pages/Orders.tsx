import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { OrderWithDetails } from '../types/database';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '../lib/utils';
import { Search, Eye, Package, Truck } from 'lucide-react';

export default function Orders() {
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderWithDetails[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  async function loadOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          school:schools(*),
          class:classes(*),
          items:order_items(*, item:items(*))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterOrders() {
    let filtered = orders;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.status === statusFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(o =>
        o.parent_phone.includes(term) ||
        o.parent_name?.toLowerCase().includes(term) ||
        o.courier_awb?.toLowerCase().includes(term) ||
        o.id.toString().includes(term)
      );
    }

    setFilteredOrders(filtered);
  }

  async function viewOrderDetails(orderId: number) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          school:schools(*),
          class:classes(*),
          items:order_items(*, item:items(*))
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setSelectedOrder(data);
    } catch (error) {
      console.error('Error loading order details:', error);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Orders</h1>
        <p className="text-slate-600 mt-1">View and manage customer orders</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by phone, name, AWB, or order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p>No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Order ID</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Customer</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">School</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Amount</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Payment</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Date</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm">#{order.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium text-slate-900">{order.parent_name || 'N/A'}</div>
                        <div className="text-xs text-slate-600">{order.parent_phone}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {order.school?.name || 'N/A'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {formatCurrency(order.total_amount_paise)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(order.payment_status)}`}>
                        {getStatusLabel(order.payment_status)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => viewOrderDetails(order.id)}
                        className="inline-flex items-center space-x-1 text-slate-600 hover:text-slate-900"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm">View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full my-8">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Order #{selectedOrder.id}</h2>
                  <p className="text-slate-600 mt-1">Placed on {formatDate(selectedOrder.created_at)}</p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Customer Information</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-slate-600">Name</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.parent_name || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600">Phone</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.parent_phone}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600">Delivery Type</dt>
                      <dd className="font-medium text-slate-900 capitalize">{selectedOrder.delivery_type}</dd>
                    </div>
                    {selectedOrder.delivery_address && (
                      <div>
                        <dt className="text-sm text-slate-600">Delivery Address</dt>
                        <dd className="font-medium text-slate-900">{selectedOrder.delivery_address}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Order Details</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-slate-600">School</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.school?.name || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600">Class</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.class?.name || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600">Payment Status</dt>
                      <dd>
                        <span className={`px-2 py-1 text-xs rounded ${getStatusColor(selectedOrder.payment_status)}`}>
                          {getStatusLabel(selectedOrder.payment_status)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600">Order Status</dt>
                      <dd>
                        <span className={`px-2 py-1 text-xs rounded ${getStatusColor(selectedOrder.status)}`}>
                          {getStatusLabel(selectedOrder.status)}
                        </span>
                      </dd>
                    </div>
                    {selectedOrder.courier_awb && (
                      <div>
                        <dt className="text-sm text-slate-600">AWB Number</dt>
                        <dd className="font-mono text-sm text-slate-900">{selectedOrder.courier_awb}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Order Items</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left py-2 px-4 text-sm font-medium text-slate-700">Item</th>
                        <th className="text-center py-2 px-4 text-sm font-medium text-slate-700">Qty</th>
                        <th className="text-right py-2 px-4 text-sm font-medium text-slate-700">Price</th>
                        <th className="text-right py-2 px-4 text-sm font-medium text-slate-700">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedOrder.items?.map((orderItem) => (
                        <tr key={orderItem.id}>
                          <td className="py-2 px-4 text-sm text-slate-900">
                            {orderItem.item?.title || 'Unknown Item'}
                          </td>
                          <td className="py-2 px-4 text-sm text-center text-slate-600">
                            {orderItem.qty}
                          </td>
                          <td className="py-2 px-4 text-sm text-right text-slate-600">
                            {formatCurrency(orderItem.unit_price_paise)}
                          </td>
                          <td className="py-2 px-4 text-sm text-right font-medium text-slate-900">
                            {formatCurrency(orderItem.unit_price_paise * orderItem.qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="py-2 px-4 text-sm font-medium text-slate-700 text-right">
                          Items Subtotal
                        </td>
                        <td className="py-2 px-4 text-sm font-medium text-slate-900 text-right">
                          {formatCurrency(selectedOrder.items_total_paise)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="py-2 px-4 text-sm font-medium text-slate-700 text-right">
                          Delivery Charges
                        </td>
                        <td className="py-2 px-4 text-sm font-medium text-slate-900 text-right">
                          {formatCurrency(selectedOrder.delivery_charge_paise)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="py-2 px-4 text-base font-bold text-slate-900 text-right">
                          Total Amount
                        </td>
                        <td className="py-2 px-4 text-base font-bold text-slate-900 text-right">
                          {formatCurrency(selectedOrder.total_amount_paise)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {selectedOrder.package_weight_grams && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center">
                    <Package className="w-5 h-5 mr-2" />
                    Shipping Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg">
                    <div>
                      <div className="text-xs text-slate-600">Actual Weight</div>
                      <div className="font-medium text-slate-900">{selectedOrder.package_weight_grams}g</div>
                    </div>
                    {selectedOrder.package_volumetric_grams && (
                      <div>
                        <div className="text-xs text-slate-600">Volumetric Weight</div>
                        <div className="font-medium text-slate-900">{selectedOrder.package_volumetric_grams}g</div>
                      </div>
                    )}
                    {selectedOrder.billed_weight_grams && (
                      <div>
                        <div className="text-xs text-slate-600">Billed Weight</div>
                        <div className="font-medium text-slate-900">{selectedOrder.billed_weight_grams}g</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-slate-600">Package Count</div>
                      <div className="font-medium text-slate-900">{selectedOrder.package_count}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50">
              <div className="flex justify-end space-x-3">
                {selectedOrder.status === 'confirmed' && !selectedOrder.courier_awb && (
                  <button className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition">
                    <Truck className="w-5 h-5" />
                    <span>Create Shipment</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
