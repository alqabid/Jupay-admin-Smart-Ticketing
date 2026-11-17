import { CheckCircle2, ShieldAlert } from 'lucide-react';
import type { StaffMember } from '../types.ts';

interface StaffRosterViewProps {
  staff: StaffMember[];
  onToggleStaff: (staffId: string, updates: { is_active?: boolean; on_shift?: boolean }) => Promise<void>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function StaffRosterView({ staff, onToggleStaff }: StaffRosterViewProps) {
  const activeOnShift = staff.filter((s) => s.is_active && s.on_shift);
  const excludedStaff = staff.filter((s) => !s.is_active || !s.on_shift);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[#161c2d]">Staff & Shifts</h1>
        <span className="text-xs text-[#869ab8]">Only active on-shift staff appear in ticket dropdowns</span>
      </div>

      {/* Unified Summary Strip */}
      <div className="card-surface rounded-xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#EEF2F7]">
        <div className="p-5">
          <div className="text-xs text-[#506690]">Assignable Now</div>
          <div className="text-2xl font-semibold text-[#14426b] mt-1 tabular-nums">
            {activeOnShift.length}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-[#506690]">Off-Shift</div>
          <div className="text-2xl font-semibold text-[#B45309] mt-1 tabular-nums">
            {staff.filter((s) => s.is_active && !s.on_shift).length}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-[#506690]">Blocked Ghost Staff</div>
          <div className="text-2xl font-semibold text-[#C62828] mt-1 tabular-nums">
            {staff.filter((s) => !s.is_active).length}
          </div>
        </div>
      </div>

      {/* Active & On-Shift Roster */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#161c2d]">
          Active Pool ({activeOnShift.length})
        </h2>
        <div className="card-surface rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-xs font-medium text-[#869ab8]">
                  <th className="py-3.5 px-5">Officer</th>
                  <th className="py-3.5 px-5">Role</th>
                  <th className="py-3.5 px-5">Shift</th>
                  <th className="py-3.5 px-5">Sync</th>
                  <th className="py-3.5 px-5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-sm">
                {activeOnShift.map((member) => (
                  <tr key={member.id} className="hover:bg-[#F9FBFE]">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#EEF3F8] text-xs font-semibold text-[#14426b] shrink-0">
                          {getInitials(member.name)}
                        </span>
                        <div>
                          <div className="font-medium text-[#161c2d]">{member.name}</div>
                          <div className="text-xs text-[#869ab8]">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#506690]">
                      {member.role} · {member.department}
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#506690]">{member.shift_label}</td>
                    <td className="py-3.5 px-5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2E7D32]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Assignable</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => onToggleStaff(member.id, { on_shift: false })}
                        className="px-3 py-1.5 text-xs font-medium text-[#506690] hover:text-[#161c2d] hover:bg-[#F7F9FC] rounded-lg transition-colors whitespace-nowrap"
                      >
                        Off-Shift
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleStaff(member.id, { is_active: false })}
                        className="px-3 py-1.5 text-xs font-medium text-[#C62828] hover:bg-[#FFF5F5] rounded-lg transition-colors whitespace-nowrap"
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Excluded / Ghost Staff */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#161c2d]">
          Excluded from Assignment ({excludedStaff.length})
        </h2>
        <div className="card-surface rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-xs font-medium text-[#869ab8]">
                  <th className="py-3.5 px-5">Staff</th>
                  <th className="py-3.5 px-5">Role</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-sm">
                {excludedStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-[#F9FBFE]">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F2F5F9] text-xs font-semibold text-[#869ab8] shrink-0">
                          {getInitials(member.name)}
                        </span>
                        <div>
                          <div className="font-medium text-[#506690]">{member.name}</div>
                          <div className="text-xs text-[#94a3b8]">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-[#869ab8]">
                      {member.role} · {member.department}
                    </td>
                    <td className="py-3.5 px-5 text-xs">
                      {!member.is_active ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#C62828]">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>{member.departed_note || 'Inactive'}</span>
                        </span>
                      ) : (
                        <span className="text-[#B45309] font-medium">
                          Off-Shift ({member.shift_label})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      {member.is_active ? (
                        <button
                          type="button"
                          onClick={() => onToggleStaff(member.id, { on_shift: true })}
                          className="px-3 py-1.5 text-xs font-medium text-[#14426b] bg-[#F0F4F9] hover:bg-[#E4ECF5] rounded-lg transition-colors whitespace-nowrap"
                        >
                          Start Shift
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onToggleStaff(member.id, { is_active: true, on_shift: true })
                          }
                          className="px-3 py-1.5 text-xs font-medium text-[#506690] hover:text-[#161c2d] hover:bg-[#F7F9FC] rounded-lg transition-colors whitespace-nowrap"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
