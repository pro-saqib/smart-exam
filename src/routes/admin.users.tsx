import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListUsers, adminUpdateUserRole } from "@/lib/db-actions";
import {
  Users,
  ShieldCheck,
  GraduationCap,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  beforeLoad: async ({ context }) => {
    const user = (context as any).user;
    if (!user || user.role !== "admin") {
      throw redirect({
        to: "/",
      });
    }
  },
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminListUsers(),
  });

  const updateRoleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "user" }) =>
      adminUpdateUserRole({ data: vars }),
    onSuccess: (_, vars) => {
      toast.success(`User role updated to ${vars.role.toUpperCase()}`);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update user role");
    },
  });

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const totalAttemptsAcrossAll = users.reduce((acc, u) => acc + u.totalAttempts, 0);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Portal
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage registered members, monitor student learning engagement, and assign admin privileges.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{totalUsers}</div>
            <div className="text-xs text-muted-foreground font-medium">Total Registered Users</div>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{adminCount}</div>
            <div className="text-xs text-muted-foreground font-medium">Platform Administrators</div>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{totalAttemptsAcrossAll}</div>
            <div className="text-xs text-muted-foreground font-medium">Total Questions Attempted</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border/60 rounded-xl p-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-medium text-muted-foreground">Filter:</span>
          <div className="flex bg-muted p-0.5 rounded-lg border border-border text-xs">
            {(["all", "admin", "user"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRoleFilter(tab)}
                className={`px-3 py-1 rounded-md font-medium capitalize transition ${
                  roleFilter === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "all" ? "All Users" : tab === "admin" ? "Admins" : "Students"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3" />
            <p className="text-sm">Loading registered users...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-destructive">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-medium">Failed to load users</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <UserIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold text-foreground">No users found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search query or filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Engagement</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredUsers.map((u) => {
                  const joinDate = new Date(u.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {u.image ? (
                            <img
                              src={u.image}
                              alt={u.name}
                              className="w-9 h-9 rounded-full border border-border object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {u.name}
                              {u.role === "admin" && (
                                <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            u.role === "admin"
                              ? "bg-purple-500/10 text-purple-600 border border-purple-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {u.role === "admin" ? (
                            <>
                              <Sparkles className="w-3 h-3" />
                              Admin
                            </>
                          ) : (
                            <>
                              <GraduationCap className="w-3 h-3" />
                              Student
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-foreground font-medium text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{u.totalAttempts} MCQs attempted</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 opacity-60" />
                          <span>{joinDate}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <select
                          value={u.role}
                          disabled={updateRoleMutation.isPending}
                          onChange={(e) => {
                            const newRole = e.target.value as "admin" | "user";
                            if (newRole !== u.role) {
                              updateRoleMutation.mutate({ userId: u.id, role: newRole });
                            }
                          }}
                          className="text-xs font-medium bg-background border border-border rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition cursor-pointer disabled:opacity-50"
                        >
                          <option value="user">Student User</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
