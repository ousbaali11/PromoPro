import type { Role } from "@/db/schema";
import {
  LayoutDashboard,
  Building2,
  FileSignature,
  Wallet,
  Users,
  UserRoundX,
  Contact,
  Wrench,
  BadgeEuro,
  Landmark,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  PDG: "PDG",
  DIRECTEUR_COMMERCIAL: "Directeur Commercial",
  COMMERCIAL: "Commercial",
  RESPONSABLE_COMMERCIAL: "Responsable Commercial",
  RESPONSABLE_ADMINISTRATIF: "Responsable Administratif",
  DIRECTEUR_FINANCIER: "Directeur Financier",
  COMPTABLE_INTERNE: "Comptable Interne",
  ASSISTANT_ADMINISTRATIF: "Assistant Administratif",
  SERVICE_APRES_VENTE: "Service Après-Vente",
  RECOUVREMENT: "Recouvrement",
};

// Pages communes à tous les rôles internes du promoteur
const COMMON: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
];

const PROJETS: NavItem = { href: "/dashboard/projets", label: "Projets & biens", icon: Building2 };
const PROPOSITIONS: NavItem = { href: "/dashboard/propositions", label: "Propositions", icon: FileSignature };
const CLIENTS: NavItem = { href: "/dashboard/clients", label: "Clients", icon: Contact };
const CONTRATS: NavItem = { href: "/dashboard/contrats", label: "Contrats", icon: FileSignature };
const PAIEMENTS: NavItem = { href: "/dashboard/paiements", label: "Paiements", icon: Wallet };
const DESISTEMENTS: NavItem = { href: "/dashboard/desistements", label: "Désistements", icon: UserRoundX };
const DESISTES: NavItem = { href: "/dashboard/desistes", label: "Biens désistés", icon: UserRoundX };
const PROSPECTS: NavItem = { href: "/dashboard/prospects", label: "Prospects", icon: Contact };
const SAV: NavItem = { href: "/dashboard/sav", label: "Service après-vente", icon: Wrench };
const RECOUVREMENT: NavItem = { href: "/dashboard/recouvrement", label: "Recouvrement", icon: BadgeEuro };
const FINANCE: NavItem = { href: "/dashboard/finance", label: "Trésorerie", icon: Landmark };
const EQUIPE: NavItem = { href: "/dashboard/equipe", label: "Équipe", icon: UsersRound };

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  PDG: [...COMMON, PROJETS, PROPOSITIONS, CLIENTS, DESISTES],
  DIRECTEUR_COMMERCIAL: [...COMMON, PROJETS, PROPOSITIONS, CLIENTS, DESISTES, EQUIPE],
  COMMERCIAL: [...COMMON, PROJETS, PROPOSITIONS, CLIENTS, DESISTES, PROSPECTS],
  RESPONSABLE_COMMERCIAL: [...COMMON, PROJETS, PROPOSITIONS, CLIENTS, DESISTES, PROSPECTS],
  RESPONSABLE_ADMINISTRATIF: [...COMMON, CONTRATS, DESISTEMENTS],
  DIRECTEUR_FINANCIER: [...COMMON, FINANCE],
  COMPTABLE_INTERNE: [...COMMON, PAIEMENTS],
  ASSISTANT_ADMINISTRATIF: [...COMMON, PROSPECTS],
  SERVICE_APRES_VENTE: [...COMMON, SAV],
  RECOUVREMENT: [...COMMON, RECOUVREMENT],
  SUPER_ADMIN: [],
};

export function navFor(role: Role): NavItem[] {
  return NAV_BY_ROLE[role] ?? COMMON;
}
