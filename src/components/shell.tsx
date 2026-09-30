"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  Droplets,
  History,
  House,
  LogOut,
  Map,
  Menu,
  Moon,
  Radio,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  X,
  Zap,
  Settings,
  Users,
  Building2,
  FileText,
} from "lucide-react";
import { useDashboard, postJSON } from "./dashboard-provider";
import { canAdmin, canOperate } from "../../shared/platform";
import { BrandLogo } from "./brand-logo";
import {
  canAccessDashboardView,
  isUserRole,
} from "../../shared/monitoring-access";
const navigation = [
  { href: "overview", label: "Overview", icon: House },
  { href: "live", label: "Live Monitoring", icon: Activity },
  { href: "heat-map", label: "School Heat Map", icon: Map },
  { href: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "energy", label: "Energy Monitoring", icon: Zap },
  { href: "water", label: "Water Management", icon: Droplets },
  { href: "devices", label: "Devices", icon: Radio },
  { href: "alerts", label: "Alerts", icon: Bell },
  { href: "control", label: "Control Panel", icon: SlidersHorizontal },
  { href: "reports", label: "Reports & History", icon: FileText },
  { href: "activity", label: "Activity Log", icon: History },
  { href: "settings", label: "Settings", icon: Settings },
  { href: "users", label: "User Management", icon: Users },
  { href: "schools", label: "School Management", icon: Building2 },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const { data, connection, error, resetDemo, locations, selectedZoneId, selectLocation } = useDashboard();
  const user = isUserRole(data.role);
  const pathname = usePathname(),
    router = useRouter();
  const [menu, setMenu] = useState(false),
    [actionError, setActionError] = useState("");
  useEffect(() => {
    if (localStorage.getItem("climate-theme") === "dark")
      document.documentElement.dataset.theme = "dark";
  }, []);
  const nav = navigation.filter((n) => {
    if (user)
      return (
        canAccessDashboardView(data.role, n.href) &&
        !["live", "reports"].includes(n.href)
      );
    if (n.href === "schools") return data.role === "super_admin";
    if (n.href === "users") return canAdmin(data.role);
    if (n.href === "control") return canOperate(data.role);
    return true;
  });
  const alerts = data.alerts.filter(
    (a) => !a.acknowledged_at && !a.resolved_at,
  ).length;
  function toggleTheme() {
    const t =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("climate-theme", t);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati navigasi
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Tutup navigasi"
          onClick={() => setMenu(false)}
        />
      )}
      <aside id="main-navigation" className={"sidebar " + (menu ? "open" : "")}>
        <Link href="/dashboard" className="brand">
          <BrandLogo />
          <span>
            Climate Shelter<small>SCHOOL MONITORING</small>
          </span>
        </Link>
        <button
          className="icon-button close-menu"
          onClick={() => setMenu(false)}
          aria-label="Tutup menu"
        >
          <X />
        </button>
        <div className="school-switch school-identity" aria-label="Sekolah akun">
          <span className="school-symbol">
            <House size={18} />
          </span>
          <div>
            <strong title={data.school.name}>{data.school.name}</strong>
            <small>{data.role === "super_admin" ? "Sekolah yang sedang dikelola" : "Sekolah akun Anda"}</small>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Navigasi utama">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              onClick={() => setMenu(false)}
              key={href}
              href={"/dashboard/" + href}
              className={
                "nav-item " +
                (pathname === "/dashboard/" + href ||
                (pathname === "/dashboard" && href === "overview")
                  ? "active"
                  : "")
              }
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>
                {user
                  ? ({
                      overview: "Monitoring",
                      analytics: "Riwayat lingkungan",
                      alerts: "Peringatan lingkungan",
                    }[href] ?? label)
                  : label}
              </span>
              {href === "alerts" && alerts > 0 && (
                <span className="nav-count">{alerts}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {data.source === "demo" && !user && (
            <div className="school-health">
              <div>
                <Radio size={16} />
                <strong>Ruang simulasi</strong>
              </div>
              <p>{data.wokwi ? "Shelter dan Ruang Kelas dari dua ESP32 Wokwi. Lapangan dan taman memakai data contoh." : "Data demo · perubahan disimpan dalam sesi ini."}</p>
              <button onClick={resetDemo}>
                <RotateCcw size={14} /> Reset simulasi
              </button>
            </div>
          )}
          <div className="profile">
            <span className="avatar">
              {data.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{data.user.name}</strong>
              <small>{user ? "User" : data.role.replace("_", " ")}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Keluar"
              onClick={async () => {
                try {
                  await postJSON("/api/auth/logout", {});
                  router.replace("/login");
                  router.refresh();
                } catch (e) {
                  setActionError(
                    e instanceof Error ? e.message : "Logout gagal.",
                  );
                }
              }}
            >
              <LogOut size={17} />
            </button>
            <ShieldCheck className="profile-shield" size={17} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Buka menu"
              aria-expanded={menu}
              aria-controls="main-navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {user
                ? pathname.endsWith("analytics")
                  ? "Riwayat lingkungan"
                  : pathname.endsWith("alerts")
                    ? "Peringatan lingkungan"
                    : "Monitoring"
                : (nav.find((n) => pathname === "/dashboard/" + n.href)
                    ?.label ?? "Overview")}
            </strong>
          </div>
          <div className="header-actions">
            {!user && (
              <span
                className={
                  "connection " + (data.source === "demo" ? "demo" : "")
                }
              >
                <Activity size={14} />
                {connection}
              </span>
            )}
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label="Ganti tema terang atau gelap"
            >
              <Sun className="theme-sun" size={19} />
              <Moon className="theme-moon" size={19} />
            </button>
            <Link
              className="notification-button icon-button"
              href="/dashboard/alerts"
              aria-label={alerts + " peringatan belum ditinjau"}
            >
              <Bell size={19} />
              {alerts > 0 && <i />}
            </Link>
          </div>
        </header>
        {(error || actionError) && (
          <div className="connection-error" role="alert">
            {error || actionError} Data terakhir tetap ditampilkan.
          </div>
        )}
        {locations.length > 0 && <div className="dashboard-location-selector"><label>Lokasi di sekolah<select value={selectedZoneId} onChange={e => selectLocation(e.target.value)}>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>}
        <main id="main-content">{children}</main>
        <footer className="footer">
          <span>
            <BrandLogo small /> Climate Shelter School
          </span>
          <span>
            {user
              ? "Monitoring kondisi lingkungan"
              : data.source === "demo"
                ? "Data simulasi · Bukan pengukuran lapangan"
                : "Data sekolah · " + data.school.timezone}
          </span>
          <Link href="/monitoring">
            Monitoring publik <ArrowUpRight size={14} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
