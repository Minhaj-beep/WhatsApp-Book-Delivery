import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Group, Item, Class, ClassGroupAssignment } from '../types/database';
import { formatCurrency } from '../lib/utils';
import { Plus, Edit2, Trash2, Package, Link as LinkIcon } from 'lucide-react';

type TabType = 'groups' | 'items' | 'assignments';

export default function Items() {
  const [activeTab, setActiveTab] = useState<TabType>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [assignments, setAssignments] = useState<ClassGroupAssignment[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [groupsRes, itemsRes, classesRes, assignmentsRes] = await Promise.all([
        supabase.from('groups').select('*').order('name'),
        supabase.from('items').select('*').order('title'),
        supabase.from('classes').select('*, schools(name)').order('id'),
        supabase.from('class_group_assignments').select('*'),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (classesRes.error) throw classesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      setGroups(groupsRes.data || []);
      setItems(itemsRes.data || []);
      setClasses(classesRes.data || []);
      setAssignments(assignmentsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveGroup(formData: FormData) {
    try {
      const name = formData.get('name') as string;
      const type = formData.get('type') as 'books' | 'stationery';

      if (editingGroup) {
        const { error } = await supabase
          .from('groups')
          .update({ name, type })
          .eq('id', editingGroup.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('groups')
          .insert({ name, type });

        if (error) throw error;
      }

      setShowGroupModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving group:', error);
      alert('Failed to save group');
    }
  }

  async function handleDeleteGroup(id: number) {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('Failed to delete group');
    }
  }

  async function handleSaveItem(formData: FormData) {
    try {
      const group_id = parseInt(formData.get('group_id') as string) || null;
      const title = formData.get('title') as string;
      const sku = formData.get('sku') as string;
      const description = formData.get('description') as string;
      const price_paise = Math.round(parseFloat(formData.get('price') as string) * 100);
      const stock = parseInt(formData.get('stock') as string) || 0;
      const weight_grams = parseInt(formData.get('weight_grams') as string) || 0;
      const length_cm = parseInt(formData.get('length_cm') as string) || null;
      const width_cm = parseInt(formData.get('width_cm') as string) || null;
      const height_cm = parseInt(formData.get('height_cm') as string) || null;
      const active = formData.get('active') === 'on';

      const itemData = {
        group_id,
        title,
        sku,
        description,
        price_paise,
        stock,
        weight_grams,
        length_cm,
        width_cm,
        height_cm,
        active,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('items')
          .insert(itemData);

        if (error) throw error;
      }

      setShowItemModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Failed to save item');
    }
  }

  async function handleDeleteItem(id: number) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item');
    }
  }

  async function handleSaveAssignment(formData: FormData) {
    try {
      const class_id = parseInt(formData.get('class_id') as string);
      const group_id = parseInt(formData.get('group_id') as string);

      const { error } = await supabase
        .from('class_group_assignments')
        .insert({ class_id, group_id });

      if (error) throw error;

      setShowAssignmentModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('Failed to save assignment. It may already exist.');
    }
  }

  async function handleDeleteAssignment(id: number) {
    if (!confirm('Are you sure you want to remove this assignment?')) return;

    try {
      const { error } = await supabase
        .from('class_group_assignments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Failed to delete assignment');
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Items & Groups</h1>
          <p className="text-slate-600 mt-1">Manage product catalog and class assignments</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex">
            {[
              { id: 'groups', label: 'Groups' },
              { id: 'items', label: 'Items' },
              { id: 'assignments', label: 'Class Assignments' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-6 py-3 font-medium transition ${
                  activeTab === tab.id
                    ? 'border-b-2 border-slate-900 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'groups' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-900">Groups</h2>
                <button
                  onClick={() => {
                    setEditingGroup(null);
                    setShowGroupModal(true);
                  }}
                  className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Group</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group) => (
                  <div key={group.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">{group.name}</h3>
                        <span className="text-xs text-slate-600 capitalize">{group.type}</span>
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => {
                            setEditingGroup(group);
                            setShowGroupModal(true);
                          }}
                          className="p-1 text-slate-600 hover:text-slate-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-1 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600">
                      {items.filter(i => i.group_id === group.id).length} items
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-900">Items</h2>
                <button
                  onClick={() => {
                    setEditingItem(null);
                    setShowItemModal(true);
                  }}
                  className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Item</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-medium text-slate-700">Item</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-700">Group</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-700">Price</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-700">Stock</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-700">Weight/Dims</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item) => {
                      const group = groups.find(g => g.id === item.group_id);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium text-slate-900">{item.title}</div>
                              {item.sku && <div className="text-xs text-slate-500">{item.sku}</div>}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {group?.name || '-'}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-slate-900">
                            {formatCurrency(item.price_paise)}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600">{item.stock}</td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            <div>{item.weight_grams}g</div>
                            {item.length_cm && item.width_cm && item.height_cm && (
                              <div>{item.length_cm}×{item.width_cm}×{item.height_cm}cm</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 text-xs rounded ${
                              item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => {
                                  setEditingItem(item);
                                  setShowItemModal(true);
                                }}
                                className="p-1 text-slate-600 hover:text-slate-900"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-900">Class-Group Assignments</h2>
                <button
                  onClick={() => setShowAssignmentModal(true)}
                  className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition"
                >
                  <LinkIcon className="w-5 h-5" />
                  <span>Add Assignment</span>
                </button>
              </div>

              <div className="space-y-2">
                {assignments.map((assignment) => {
                  const classItem = classes.find(c => c.id === assignment.class_id);
                  const group = groups.find(g => g.id === assignment.group_id);
                  return (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between border border-slate-200 rounded-lg p-4"
                    >
                      <div className="flex items-center space-x-4">
                        <Package className="w-5 h-5 text-slate-400" />
                        <div>
                          <div className="font-medium text-slate-900">
                            {(classItem as any)?.schools?.name} - {classItem?.name}
                          </div>
                          <div className="text-sm text-slate-600">
                            Assigned: {group?.name} ({group?.type})
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteAssignment(assignment.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              {editingGroup ? 'Edit Group' : 'Add Group'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveGroup(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Group Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingGroup?.name}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Type
                </label>
                <select
                  name="type"
                  required
                  defaultValue={editingGroup?.type}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                >
                  <option value="books">Books</option>
                  <option value="stationery">Stationery</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 my-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              {editingItem ? 'Edit Item' : 'Add Item'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveItem(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Item Title
                  </label>
                  <input
                    name="title"
                    type="text"
                    required
                    defaultValue={editingItem?.title}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    SKU
                  </label>
                  <input
                    name="sku"
                    type="text"
                    defaultValue={editingItem?.sku || ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Group
                  </label>
                  <select
                    name="group_id"
                    defaultValue={editingItem?.group_id || ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  >
                    <option value="">No Group</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Price (₹)
                  </label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={editingItem ? (editingItem.price_paise / 100).toFixed(2) : ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Stock
                  </label>
                  <input
                    name="stock"
                    type="number"
                    required
                    defaultValue={editingItem?.stock || 0}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={editingItem?.description || ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2 border-t pt-4">
                  <h3 className="font-medium text-slate-900 mb-3">Shipping Dimensions</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Weight (grams)
                  </label>
                  <input
                    name="weight_grams"
                    type="number"
                    required
                    defaultValue={editingItem?.weight_grams || 0}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Length (cm)
                  </label>
                  <input
                    name="length_cm"
                    type="number"
                    defaultValue={editingItem?.length_cm || ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Width (cm)
                  </label>
                  <input
                    name="width_cm"
                    type="number"
                    defaultValue={editingItem?.width_cm || ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Height (cm)
                  </label>
                  <input
                    name="height_cm"
                    type="number"
                    defaultValue={editingItem?.height_cm || ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2 flex items-center">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={editingItem?.active ?? true}
                    className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900"
                  />
                  <label className="ml-2 text-sm text-slate-700">Active</label>
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Add Class-Group Assignment
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveAssignment(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Class
                </label>
                <select
                  name="class_id"
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                >
                  <option value="">Select a class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {(c as any).schools?.name} - {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Group
                </label>
                <select
                  name="group_id"
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                >
                  <option value="">Select a group</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAssignmentModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
