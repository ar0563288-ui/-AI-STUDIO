import React, { useState } from 'react';
import { Check, LogOut, Smartphone, UserCheck } from 'lucide-react';
import { api } from '../lib/api';
import { CreditTransaction, UserProfile } from '../types/studio';

interface AccountSettingsViewProps {
  user: UserProfile;
  transactions: CreditTransaction[];
  onUserUpdated: (user: UserProfile) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

const PLANS: Array<{
  id: 'free' | 'pro' | 'studio';
  name: string;
  price: string;
  audience: string;
  limits: string[];
}> = [
  {
    id: 'free',
    name: 'Free Starter',
    price: '$0 / mo',
    audience: 'For individual exploration',
    limits: ['250 Chat credits', '40 Image credits', '20 Video credits', '20 Music credits', '50 Voice credits'],
  },
  {
    id: 'pro',
    name: 'Pro Creator',
    price: '$24 / mo',
    audience: 'For daily creators & channels',
    limits: ['+1,000 Chat credits', '+150 Image credits', '+60 Video credits', '+60 Music credits', '+200 Voice credits'],
  },
  {
    id: 'studio',
    name: 'Studio Team',
    price: '$79 / mo',
    audience: 'For agencies & high-volume studios',
    limits: ['+5,000 Chat credits', '+600 Image credits', '+240 Video credits', '+240 Music credits', '+1,000 Voice credits'],
  },
];

export function AccountSettingsView({
  user,
  transactions,
  onUserUpdated,
  onOpenAuth,
  onLogout,
}: AccountSettingsViewProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [saving, setSaving] = useState(false);
  const [pendingUpgrade, setPendingUpgrade] = useState<'pro' | 'studio' | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await api.updateProfile({ fullName });
      onUserUpdated(res.user);
      setStatusMessage('Profile updated and synced.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmUpgrade() {
    if (!pendingUpgrade || !confirmChecked) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await api.confirmUpgrade(pendingUpgrade);
      onUserUpdated(res.user);
      setStatusMessage(`Plan upgraded to ${pendingUpgrade.toUpperCase()} with explicit confirmation.`);
      setPendingUpgrade(null);
      setConfirmChecked(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile & Account Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-6 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Profile Settings</h2>
            <span className="text-xs font-mono text-violet-300/75 uppercase">{user.planTier}</span>
          </div>

          <div className="flex items-center gap-4">
            <img
              src={user.avatarUrl || '/src/assets/images/avatar_studio_creator_1794729447526.jpg'}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-xl object-cover border border-violet-500/25 bg-[#161026]"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.fullName}</div>
              <div className="text-xs text-violet-200/60 truncate">{user.email}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Display Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          {statusMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200">
              {statusMessage}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white"
            >
              Save Profile
            </button>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-lg bg-[#161026] hover:bg-[#1E1633] border border-violet-500/20 text-xs font-medium text-violet-100 inline-flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Switch / Register Account</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 rounded-lg bg-transparent hover:bg-red-500/10 border border-red-500/25 text-xs font-medium text-red-300 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </form>

        {/* Native Android Companion Sync Info */}
        <section className="lg:col-span-6 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-violet-400" />
            <h2 className="text-base font-semibold text-white">Android Native Companion (Expo)</h2>
          </div>
          <p className="text-xs text-violet-200/70 leading-relaxed">
            The native React Native / Expo Android application in <span className="font-mono text-violet-200">/android-app</span> connects directly to this shared backend API using your exact account, credits, chat threads, and generated media files.
          </p>
          <div className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 space-y-1.5 text-xs">
            <div className="text-violet-300/70">Shared API Base URL</div>
            <div className="font-mono text-white break-all">{window.location.origin}</div>
            <div className="text-violet-300/70 pt-1">Signed-in Account</div>
            <div className="font-mono text-violet-200">{user.email}</div>
          </div>
        </section>
      </div>

      {/* Subscription-Ready Plans (Requires Explicit Confirmation) */}
      <section className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Subscription-Ready Credit Tiers</h2>
          <p className="text-xs text-violet-200/60 mt-0.5">
            Free user accounts work out of the box. Paid tier upgrades require your explicit confirmation and never auto-charge.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = user.planTier === plan.id;
            return (
              <div
                key={plan.id}
                className={`p-5 rounded-xl border flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-[#161026] border-violet-500'
                    : 'bg-[#090611] border-violet-500/15'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">{plan.name}</div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-violet-300">
                      {plan.price}
                    </div>
                  </div>
                  <div className="text-xs text-violet-200/60 mt-1">{plan.audience}</div>
                  <ul className="mt-4 space-y-2 text-xs text-violet-100/80">
                    {plan.limits.map((lim) => (
                      <li key={lim} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <span className="font-mono tabular-nums">{lim}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5">
                  {isCurrent ? (
                    <div className="w-full py-2 text-center rounded-lg border border-violet-500/30 text-xs font-medium text-violet-200">
                      Active Tier
                    </div>
                  ) : plan.id !== 'free' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingUpgrade(plan.id as 'pro' | 'studio');
                        setConfirmChecked(false);
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition-colors"
                    >
                      Select {plan.name}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Credit Usage Ledger */}
      <section className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Credit Usage History</h2>
          <span className="text-xs font-mono tabular-nums text-violet-300/70">
            Total Balance: {user.credits.total} credits
          </span>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-violet-200/55">No credit transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-violet-500/15 text-violet-200/60">
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 text-right font-medium">Delta</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th className="py-2 text-right font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/10">
                {transactions.slice(0, 20).map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2.5 pr-4 text-white">{tx.description}</td>
                    <td className="py-2.5 pr-4 font-mono text-violet-300/75 uppercase">{tx.category}</td>
                    <td
                      className={`py-2.5 pr-4 text-right font-mono tabular-nums ${
                        tx.amount >= 0 ? 'text-emerald-400' : 'text-violet-200'
                      }`}
                    >
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-violet-100">
                      {tx.balance_after}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-violet-200/55">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Explicit Payment Confirmation Modal */}
      {pendingUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-[#0F0A1A] border border-violet-500/30 p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">
              Confirm {pendingUpgrade.toUpperCase()} Tier Upgrade
            </h3>
            <p className="text-xs text-violet-200/75 leading-relaxed">
              No charges occur without your explicit confirmation. Check the box below to confirm upgrading your workspace tier and applying the corresponding credit allocation.
            </p>
            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#08050F] border border-violet-500/20 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <span className="text-xs text-violet-100">
                I explicitly confirm upgrading to the {pendingUpgrade.toUpperCase()} tier.
              </span>
            </label>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingUpgrade(null)}
                className="px-4 py-2 rounded-lg bg-[#161026] text-xs font-medium text-violet-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!confirmChecked || saving}
                onClick={handleConfirmUpgrade}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-xs font-medium text-white"
              >
                Confirm Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
