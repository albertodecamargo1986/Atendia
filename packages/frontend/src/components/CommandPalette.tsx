import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search, Lock, CornerDownLeft, Smartphone, Bot, UserPlus, Moon, Sun, Rocket, LogOut, type LucideIcon,
} from 'lucide-react';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import {
  NAV_SECTIONS, canSee, visibleTabs, isModuleLocked, isItemLocked, lockedModuleOf, stripAccents, useOpenLocked,
} from '../lib/navigation';

const OPEN_EVENT = 'atendia:open-command-palette';

/** Abre a busca rápida de qualquer lugar (ex.: botão "Buscar…" do topo). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

interface Entry {
  key: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords: string[];
  locked?: boolean;
  run: () => void;
}

function words(...parts: (string | string[] | undefined)[]): string[] {
  const all = parts.flat().filter(Boolean) as string[];
  return Array.from(new Set(all.flatMap((w) => [w, stripAccents(w)])));
}

/**
 * Filtro por palavras (sem acento): cada palavra digitada precisa aparecer no nome
 * ou nas palavras-chave. O filtro "aproximado" padrão do cmdk achava coisas sem relação.
 */
function filterEntries(value: string, search: string, keywords?: string[]): number {
  const terms = stripAccents(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  // o valor é "Nome|chave": a chave só existe para deixar o valor único
  const name = stripAccents(value.split('|')[0]);
  const hay = `${name} ${stripAccents((keywords || []).join(' '))}`;
  if (!terms.every((t) => hay.includes(t))) return 0;
  if (terms.every((t) => name.includes(t))) return name.startsWith(terms[0]) ? 1 : 0.8;
  return 0.5;
}

/**
 * Busca rápida (Ctrl+K / ⌘K): vai para qualquer tela ou faz uma ação comum.
 * Abre e fecha sem animação — é um atalho de teclado usado muitas vezes ao dia.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { user, tenant, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const openLocked = useOpenLocked();
  const role = user?.role;
  const plan = tenant?.plan;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const groups = useMemo(() => {
    const result: { heading: string; entries: Entry[] }[] = [];

    for (const section of NAV_SECTIONS) {
      const entries: Entry[] = [];
      for (const item of section.items) {
        if (!canSee(item.audience, role)) continue;
        const tabs = visibleTabs(item, role);
        if (tabs.length <= 1) {
          const locked = isItemLocked(item, role, plan);
          const to = tabs[0]?.to || item.to;
          entries.push({
            key: item.id,
            label: item.label,
            icon: item.icon,
            keywords: words(item.label, item.keywords, tabs[0]?.label, tabs[0]?.keywords),
            locked,
            run: () => (locked ? openLocked(item.label, lockedModuleOf(item, role)) : navigate(to)),
          });
          continue;
        }
        for (const tab of tabs) {
          const locked = isModuleLocked(plan, tab.module);
          entries.push({
            key: tab.to,
            label: tab.label,
            hint: item.label,
            icon: item.icon,
            keywords: words(tab.label, item.label, tab.keywords, item.keywords),
            locked,
            run: () => (locked ? openLocked(tab.label, tab.module) : navigate(tab.to)),
          });
        }
      }
      if (entries.length) result.push({ heading: section.title, entries });
    }

    const actions: Entry[] = [];
    if (isOwnerOrAdmin(role)) {
      const waLocked = isModuleLocked(plan, 'whatsapp');
      actions.push({
        key: 'action-whatsapp', label: 'Conectar WhatsApp', icon: Smartphone,
        keywords: words('conectar whatsapp', 'qr code', 'numero', 'celular'), locked: waLocked,
        run: () => (waLocked ? openLocked('WhatsApp', 'whatsapp') : navigate('/whatsapp')),
      });
      const agLocked = isModuleLocked(plan, 'agents');
      actions.push({
        key: 'action-agent', label: 'Criar novo agente de IA', icon: Bot,
        keywords: words('novo agente', 'criar robo', 'bot'), locked: agLocked,
        run: () => (agLocked ? openLocked('Agentes de IA', 'agents') : navigate('/agents/new')),
      });
    }
    const ctLocked = isModuleLocked(plan, 'contacts');
    actions.push({
      key: 'action-contact', label: 'Adicionar contato', icon: UserPlus,
      keywords: words('novo contato', 'cliente', 'cadastrar'), locked: ctLocked,
      run: () => (ctLocked ? openLocked('Contatos', 'contacts') : navigate('/contacts')),
    });
    actions.push({
      key: 'action-theme', label: theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro',
      icon: theme === 'dark' ? Sun : Moon,
      keywords: words('tema', 'modo escuro', 'modo claro', 'dark', 'cores'),
      run: toggleTheme,
    });
    if (isOwnerOrAdmin(role)) {
      actions.push({
        key: 'action-onboarding', label: 'Assistente de configuração', icon: Rocket,
        keywords: words('primeiros passos', 'configurar', 'passo a passo', 'ajuda'),
        run: () => navigate('/onboarding'),
      });
    }
    actions.push({
      key: 'action-logout', label: 'Sair', icon: LogOut,
      keywords: words('sair', 'deslogar', 'logout', 'encerrar sessao'),
      run: () => { logout(); navigate('/login'); },
    });
    result.push({ heading: 'Ações rápidas', entries: actions });

    return result;
  }, [role, plan, theme, navigate, openLocked, toggleTheme, logout]);

  function select(entry: Entry) {
    setOpen(false);
    entry.run();
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Busca rápida"
      loop
      filter={filterEntries}
      overlayClassName="fixed inset-0 z-[90] bg-black/40"
      contentClassName="fixed z-[91] left-1/2 top-[12vh] -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl rounded-xl border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-modal overflow-hidden focus:outline-none"
    >
      <Dialog.Title className="sr-only">Busca rápida</Dialog.Title>
      <Dialog.Description className="sr-only">Digite para achar uma tela ou uma ação e tecle Enter.</Dialog.Description>
      <div className="flex items-center gap-2 px-4 border-b border-[var(--border-color)]">
        <Search size={16} className="text-[var(--text-tertiary)] shrink-0" aria-hidden />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Para onde você quer ir? Ex.: senha, WhatsApp, plano…"
          className="flex-1 h-12 bg-transparent text-sm outline-none focus-visible:outline-none border-0 focus:ring-0 placeholder:text-[var(--text-tertiary)]"
        />
        <kbd className="hidden sm:inline text-[10px] font-medium text-[var(--text-tertiary)] border border-[var(--border-color)] rounded px-1.5 py-0.5">Esc</kbd>
      </div>
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="py-8 text-center text-sm text-[var(--text-secondary)]">
          Nada encontrado. Tente outra palavra.
        </Command.Empty>
        {groups.map((group) => (
          <Command.Group key={group.heading} heading={group.heading}>
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <Command.Item
                  key={entry.key}
                  value={`${entry.hint ? `${entry.hint} ` : ''}${entry.label}|${entry.key}`}
                  keywords={entry.keywords}
                  onSelect={() => select(entry)}
                >
                  <Icon size={16} className="shrink-0 text-[var(--text-secondary)]" aria-hidden />
                  <span className="flex-1 min-w-0 truncate">
                    {entry.hint && <span className="text-[var(--text-tertiary)]">{entry.hint} › </span>}
                    {entry.label}
                  </span>
                  {entry.locked
                    ? <Lock size={13} className="shrink-0 text-[var(--text-tertiary)]" aria-label="Bloqueado no seu plano" />
                    : <CornerDownLeft size={13} className="shrink-0 text-[var(--text-tertiary)] opacity-0 [[data-selected=true]_&]:opacity-100" aria-hidden />}
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
