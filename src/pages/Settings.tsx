import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Setting } from '../types/database';
import { Save, AlertCircle } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, any>>({
    default_packaging_weight_grams: 50,
    volumetric_divisor: 5000,
    school_delivery_charge_paise: 5000,
    home_delivery_charge_paise: 15000,
    weight_rounding_grams: 500,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*');

      if (error) throw error;

      const settingsMap: Record<string, any> = {};
      data?.forEach((setting: Setting) => {
        settingsMap[setting.id] = setting.value;
      });

      setSettings(prev => ({ ...prev, ...settingsMap }));
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const updates = Object.entries(settings).map(([key, value]) => ({
        id: key,
        value: value,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('settings')
          .upsert(update);

        if (error) throw error;
      }

      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key: string, value: any) {
    setSettings(prev => ({ ...prev, [key]: value }));
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
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-1">Configure system-wide settings</p>
      </div>

      <form onSubmit={handleSave} className="max-w-3xl">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          {message && (
            <div className={`p-4 rounded-lg flex items-center space-x-2 ${
              message.includes('success')
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <AlertCircle className="w-5 h-5" />
              <span>{message}</span>
            </div>
          )}

          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-4">Shipping Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Default Packaging Weight (grams)
                </label>
                <input
                  type="number"
                  value={settings.default_packaging_weight_grams}
                  onChange={(e) => updateSetting('default_packaging_weight_grams', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Weight added for packaging materials (e.g., 50g)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Volumetric Divisor
                </label>
                <input
                  type="number"
                  value={settings.volumetric_divisor}
                  onChange={(e) => updateSetting('volumetric_divisor', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Formula: (L × W × H) / divisor = volumetric weight in kg (default: 5000)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Weight Rounding (grams)
                </label>
                <input
                  type="number"
                  value={settings.weight_rounding_grams}
                  onChange={(e) => updateSetting('weight_rounding_grams', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Round up billed weight to nearest value (e.g., 500g)
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Delivery Charges</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  School Delivery Charge (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={(settings.school_delivery_charge_paise / 100).toFixed(2)}
                  onChange={(e) => updateSetting('school_delivery_charge_paise', Math.round(parseFloat(e.target.value) * 100))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Flat rate for school delivery (default: ₹50)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Home Delivery Charge (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={(settings.home_delivery_charge_paise / 100).toFixed(2)}
                  onChange={(e) => updateSetting('home_delivery_charge_paise', Math.round(parseFloat(e.target.value) * 100))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Flat rate for home delivery (default: ₹150)
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">API Configuration</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                API keys and secrets are configured as environment variables in Supabase Edge Functions.
                To update these values, modify them in your Supabase project settings.
              </p>
              <ul className="mt-2 text-xs text-blue-800 space-y-1">
                <li>• WhatsApp API credentials</li>
                <li>• Razorpay API keys</li>
                <li>• Delhivery API credentials</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
