import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { School, Class } from '../types/database';
import { generateSchoolCode, formatDate } from '../lib/utils';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

export default function Schools() {
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<Record<number, Class[]>>({});
  const [expandedSchools, setExpandedSchools] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSchools();
  }, []);

  async function loadSchools() {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error loading schools:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadClasses(schoolId: number) {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .order('sort_order');

      if (error) throw error;
      setClasses(prev => ({ ...prev, [schoolId]: data || [] }));
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  }

  function toggleSchool(schoolId: number) {
    const newExpanded = new Set(expandedSchools);
    if (newExpanded.has(schoolId)) {
      newExpanded.delete(schoolId);
    } else {
      newExpanded.add(schoolId);
      if (!classes[schoolId]) {
        loadClasses(schoolId);
      }
    }
    setExpandedSchools(newExpanded);
  }

  function openSchoolModal(school?: School) {
    setEditingSchool(school || null);
    setShowModal(true);
  }

  function openClassModal(schoolId: number, classItem?: Class) {
    setSelectedSchoolId(schoolId);
    setEditingClass(classItem || null);
    setShowClassModal(true);
  }

  async function handleSaveSchool(formData: FormData) {
    try {
      const name = formData.get('name') as string;
      const address = formData.get('address') as string;
      const contact_phone = formData.get('contact_phone') as string;
      const active = formData.get('active') === 'on';

      if (editingSchool) {
        const { error } = await supabase
          .from('schools')
          .update({ name, address, contact_phone, active })
          .eq('id', editingSchool.id);

        if (error) throw error;
      } else {
        let code = generateSchoolCode();
        let attempts = 0;

        while (attempts < 5) {
          const { data: existing } = await supabase
            .from('schools')
            .select('id')
            .eq('code_4digit', code)
            .maybeSingle();

          if (!existing) break;
          code = generateSchoolCode();
          attempts++;
        }

        const { error } = await supabase
          .from('schools')
          .insert({ name, code_4digit: code, address, contact_phone, active });

        if (error) throw error;
      }

      setShowModal(false);
      loadSchools();
    } catch (error) {
      console.error('Error saving school:', error);
      alert('Failed to save school');
    }
  }

  async function handleDeleteSchool(id: number) {
    if (!confirm('Are you sure you want to delete this school? This will also delete all its classes.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('schools')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadSchools();
    } catch (error) {
      console.error('Error deleting school:', error);
      alert('Failed to delete school');
    }
  }

  async function handleSaveClass(formData: FormData) {
    if (!selectedSchoolId) return;

    try {
      const name = formData.get('name') as string;
      const sort_order = parseInt(formData.get('sort_order') as string) || 0;

      if (editingClass) {
        const { error } = await supabase
          .from('classes')
          .update({ name, sort_order })
          .eq('id', editingClass.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('classes')
          .insert({ school_id: selectedSchoolId, name, sort_order });

        if (error) throw error;
      }

      setShowClassModal(false);
      loadClasses(selectedSchoolId);
    } catch (error) {
      console.error('Error saving class:', error);
      alert('Failed to save class');
    }
  }

  async function handleDeleteClass(id: number, schoolId: number) {
    if (!confirm('Are you sure you want to delete this class?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadClasses(schoolId);
    } catch (error) {
      console.error('Error deleting class:', error);
      alert('Failed to delete class');
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
          <h1 className="text-3xl font-bold text-slate-900">Schools</h1>
          <p className="text-slate-600 mt-1">Manage schools and their classes</p>
        </div>
        <button
          onClick={() => openSchoolModal()}
          className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Add School</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {schools.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p>No schools yet. Click "Add School" to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {schools.map((school) => (
              <div key={school.id}>
                <div className="p-4 hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <button
                        onClick={() => toggleSchool(school.id)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {expandedSchools.has(school.id) ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-semibold text-slate-900">{school.name}</h3>
                          <span className="px-3 py-1 bg-slate-900 text-white text-xs font-mono rounded">
                            {school.code_4digit}
                          </span>
                          {!school.active && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {school.address} • {school.contact_phone} • Added {formatDate(school.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openSchoolModal(school)}
                        className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSchool(school.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {expandedSchools.has(school.id) && (
                  <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-slate-900">Classes</h4>
                      <button
                        onClick={() => openClassModal(school.id)}
                        className="flex items-center space-x-1 text-sm text-slate-600 hover:text-slate-900"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Class</span>
                      </button>
                    </div>
                    {classes[school.id]?.length > 0 ? (
                      <div className="space-y-2">
                        {classes[school.id].map((classItem) => (
                          <div
                            key={classItem.id}
                            className="flex items-center justify-between bg-white px-3 py-2 rounded border border-slate-200"
                          >
                            <span className="text-sm text-slate-900">{classItem.name}</span>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => openClassModal(school.id, classItem)}
                                className="text-slate-600 hover:text-slate-900"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteClass(classItem.id, school.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No classes yet</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              {editingSchool ? 'Edit School' : 'Add School'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveSchool(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  School Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingSchool?.name}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  rows={3}
                  defaultValue={editingSchool?.address || ''}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Contact Phone
                </label>
                <input
                  name="contact_phone"
                  type="tel"
                  defaultValue={editingSchool?.contact_phone || ''}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div className="flex items-center">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editingSchool?.active ?? true}
                  className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900"
                />
                <label className="ml-2 text-sm text-slate-700">Active</label>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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

      {showClassModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              {editingClass ? 'Edit Class' : 'Add Class'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveClass(new FormData(e.currentTarget));
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Class Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingClass?.name}
                  placeholder="e.g., Class 1, Grade 5A"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Sort Order
                </label>
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={editingClass?.sort_order || 0}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
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
