'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import { Button } from '@gtour/ui';
import { Field, ImageUploader, Input } from '@gtour/ui';
import { apiClient, getApiErrorMessage } from '@gtour/utils';

type Option = { _id: string; name: string; country?: string; region?: string; icon?: string };

type Destination = {
  _id: string;
  name: string;
  description: string;
  images: string[];
  estimated_budget?: number;
  best_visit_season?: string;
  category_id: any;
  location_id: any;
};

function toId(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || '';
}

export default function DestinationForm({ mode, id }: { mode: 'create' | 'edit'; id?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [bestVisitSeason, setBestVisitSeason] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');

  const title = mode === 'create' ? 'Create destination' : 'Edit destination';
  const subtitle = mode === 'create'
    ? 'Add a new destination (admin). Requires valid category and location.'
    : 'Update destination details (admin).';

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [filtersRes, destRes] = await Promise.all([
          apiClient.get('/destinations/filters'),
          mode === 'edit' && id ? apiClient.get(`/destinations/${id}`) : Promise.resolve(null),
        ]);
        setCategories(filtersRes.data.categories || []);
        setLocations(filtersRes.data.locations || []);

        if (destRes) {
          const d: Destination = destRes.data.destination;
          setName(d.name || '');
          setDescription(d.description || '');
          setImages((d.images || []).filter(Boolean));
          setEstimatedBudget(d.estimated_budget != null ? String(d.estimated_budget) : '');
          setBestVisitSeason(d.best_visit_season || '');
          setCategoryId(toId(d.category_id));
          setLocationId(toId(d.location_id));
        }
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (name.trim().length < 2) return setError('Name must be at least 2 characters.');
    if (description.trim().length < 10) return setError('Description must be at least 10 characters.');
    if (images.length === 0) return setError('Please upload at least one image.');
    if (!categoryId) return setError('Select a category.');
    if (!locationId) return setError('Select a location.');

    const payload: any = {
      name: name.trim(),
      description: description.trim(),
      images,
      best_visit_season: bestVisitSeason.trim() || undefined,
      category_id: categoryId,
      location_id: locationId,
    };
    if (estimatedBudget.trim()) {
      const n = Number(estimatedBudget);
      if (!Number.isFinite(n) || n <= 0) return setError('Estimated budget must be a positive number.');
      payload.estimated_budget = n;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await apiClient.post('/destinations', payload);
        setSuccess('Destination created successfully.');
      } else if (id) {
        await apiClient.put(`/destinations/${id}`, payload);
        setSuccess('Destination updated successfully.');
      }
      setTimeout(() => {
        router.push('/destinations');
        router.refresh();
      }, 700);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title={title} subtitle={subtitle}>
      <div className="rounded-3xl border border-sand-200/80 bg-white/95 p-5 shadow-[0_20px_50px_-30px_rgba(12,28,44,0.3)] sm:p-6">
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-ink-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-sand-300 border-t-sea-500" />Loading formâ€¦</div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? <div role="alert" className="rounded-2xl border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">{error}</div> : null}
            {success ? <div role="status" className="rounded-2xl border border-sea-200 bg-sea-50 px-4 py-3 text-sm font-medium text-sea-700">{success}</div> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Destination name" htmlFor="dest-name" className="sm:col-span-2">
                <Input id="dest-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-white" placeholder="e.g. Bali" />
              </Field>

              <div className="sm:col-span-2">
                <label htmlFor="dest-desc" className="mb-1.5 block text-sm font-semibold tracking-[-0.01em] text-ink-800">Description</label>
                <textarea
                  id="dest-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="block w-full rounded-2xl border border-sand-300/90 bg-white/95 px-4 py-3 text-[15px] leading-6 text-ink-900 shadow-[0_1px_0_rgba(12,28,44,0.02)] placeholder:text-ink-400/90 transition-all hover:border-sand-400 focus:border-sea-500 focus:outline-none focus:shadow-[0_0_0_4px_rgba(20,122,128,0.10)]"
                  placeholder="Describe the destination, highlights, and travel experienceâ€¦"
                />
              </div>

              <div>
                <label htmlFor="dest-category" className="mb-1.5 block text-sm font-semibold tracking-[-0.01em] text-ink-800">Category</label>
                <select
                  id="dest-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="block min-h-[3rem] w-full rounded-2xl border border-sand-300/90 bg-white/95 px-4 py-3 text-[15px] text-ink-900 transition-all hover:border-sand-400 focus:border-sea-500 focus:outline-none focus:shadow-[0_0_0_4px_rgba(20,122,128,0.10)]"
                >
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="dest-location" className="mb-1.5 block text-sm font-semibold tracking-[-0.01em] text-ink-800">Location</label>
                <select
                  id="dest-location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="block min-h-[3rem] w-full rounded-2xl border border-sand-300/90 bg-white/95 px-4 py-3 text-[15px] text-ink-900 transition-all hover:border-sand-400 focus:border-sea-500 focus:outline-none focus:shadow-[0_0_0_4px_rgba(20,122,128,0.10)]"
                >
                  <option value="">Select location</option>
                  {locations.map((l) => <option key={l._id} value={l._id}>{l.name}{l.country ? `, ${l.country}` : ''}</option>)}
                </select>
              </div>

              <Field label="Estimated budget (BDT)" htmlFor="dest-budget">
                <Input id="dest-budget" type="number" min="0" step="1" value={estimatedBudget} onChange={(e) => setEstimatedBudget(e.target.value)} className="bg-white" placeholder="e.g. 1200" />
              </Field>

              <Field label="Best visit season" htmlFor="dest-season">
                <Input id="dest-season" value={bestVisitSeason} onChange={(e) => setBestVisitSeason(e.target.value)} className="bg-white" placeholder="e.g. April - October" />
              </Field>

              <div className="sm:col-span-2">
                <ImageUploader
                  id="dest-images"
                  label="Images"
                  required
                  value={images}
                  onChange={setImages}
                  hint="At least one image is required. The first image is used as the cover photo."
                />
              </div>
            </div>

            {(categories.length === 0 || locations.length === 0) ? (
              <div className="rounded-2xl border border-gold-200/70 bg-gold-100/30 px-4 py-3 text-sm text-ink-700">
                Categories and locations are required. If none are available, <a href="/categories" className="font-semibold text-sea-700 underline">add a category</a> and/or <a href="/locations" className="font-semibold text-sea-700 underline">add a location</a> first.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-1">
              <Button type="submit" size="lg" disabled={saving || Boolean(success)}>
                {saving ? (mode === 'create' ? 'Creatingâ€¦' : 'Savingâ€¦') : (mode === 'create' ? 'Create destination' : 'Save changes')}
              </Button>
              <button
                type="button"
                onClick={() => router.push('/destinations')}
                className="inline-flex min-h-[3.25rem] items-center justify-center rounded-pill border border-ink-200 bg-white px-6 text-sm font-semibold text-ink-700 transition hover:border-sea-300 hover:bg-sand-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminShell>
  );
}

