"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { motion, useAnimationControls } from "motion/react";
import { AlertCircle, CheckCircle2, ChevronDown, Eye, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Champs de formulaire.
 *
 * Deux modes, selon la présence de la prop `label` :
 * - sans `label` : champ nu, compatible avec l'ancien `<Field label>…</Field>`
 *   (label statique au-dessus) — utilisé par les pages non encore refondues ;
 * - avec `label` : étiquette flottante qui se réduit et remonte au focus ou
 *   quand le champ est rempli, validation inline (icône + message, secousse
 *   à l'apparition d'une erreur), bouton d'effacement sur les champs texte
 *   remplis, bouton afficher/masquer sur les mots de passe.
 *
 * Le `label` reste un vrai <label for=…> : les tests et lecteurs d'écran
 * continuent d'associer libellé et champ.
 */

type Etat = { error?: string | null; success?: string | null };

const base =
  "peer w-full rounded-sm border bg-white text-body text-navy-900 shadow-inset-input " +
  "transition-[border-color,box-shadow,background-color] duration-fast ease-linear " +
  "placeholder:text-navy-300 focus:outline-none focus:border-gold focus:shadow-focus " +
  "disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400 " +
  "read-only:bg-cream-100";

function bordure({ error, success }: Etat) {
  if (error) return "border-danger-border focus:border-danger focus:shadow-[0_0_0_3px_rgb(180_35_24/0.2)]";
  if (success) return "border-success-border";
  return "border-navy-100 hover:border-navy-200";
}

/** Secousse horizontale à l'apparition d'une erreur (jamais en boucle). */
function useSecousse(error?: string | null) {
  const controls = useAnimationControls();
  const precedent = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (error && error !== precedent.current) {
      void controls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.36, ease: "easeOut" } });
    }
    precedent.current = error;
  }, [error, controls]);
  return controls;
}

function MessageEtat({ id, error, success }: Etat & { id: string }) {
  if (!error && !success) return null;
  return (
    <p
      id={id}
      role={error ? "alert" : undefined}
      className={cn("mt-1.5 flex items-center gap-1.5 text-caption", error ? "text-danger-fg" : "text-success-fg")}
    >
      {error ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      {error ?? success}
    </p>
  );
}

const labelFlottant =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 origin-left text-body text-navy-400 " +
  "transition-[transform,color,top,font-size] duration-fast ease-linear " +
  "peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-label peer-focus:text-gold-600 " +
  "peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-label " +
  "peer-disabled:text-navy-300";

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  Etat & {
    label?: ReactNode;
    /** Bouton d'effacement rapide (par défaut : oui en mode label flottant, sur les champs texte). */
    clearable?: boolean;
    /** Texte d'aide sous le champ. */
    hint?: ReactNode;
    /** Icône à gauche (recherche, devise…). */
    leading?: ReactNode;
    containerClassName?: string;
    onClear?: () => void;
  };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, success, clearable, hint, leading, containerClassName, onClear, className, type = "text", id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const [visible, setVisible] = useState(false);
  const [rempli, setRempli] = useState(!!props.value || !!props.defaultValue);
  const interne = useRef<HTMLInputElement | null>(null);
  const controls = useSecousse(error);

  const estMotDePasse = type === "password";
  const typeEffectif = estMotDePasse && visible ? "text" : type;
  const peutEffacer = (clearable ?? !!label) && !estMotDePasse && !props.disabled && !props.readOnly && rempli;

  const setRef = (el: HTMLInputElement | null) => {
    interne.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const effacer = () => {
    const el = interne.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    setRempli(false);
    onClear?.();
  };

  // Mode nu (dans un <Field> statique) : rendu compact, sans décor
  if (!label && !error && !success && !estMotDePasse && !leading) {
    return (
      <input
        ref={setRef}
        id={inputId}
        type={typeEffectif}
        className={cn(base, "h-10 px-3", bordure({}), className)}
        {...props}
      />
    );
  }

  const padGauche = leading ? "pl-9" : "pl-3";
  const padDroit = estMotDePasse || peutEffacer ? "pr-10" : "pr-3";

  return (
    <div className={cn("block", containerClassName)}>
      <motion.div animate={controls} className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-300 [&_svg]:h-4 [&_svg]:w-4">
            {leading}
          </span>
        )}
        <input
          ref={setRef}
          id={inputId}
          type={typeEffectif}
          placeholder={label ? " " : props.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || success ? messageId : undefined}
          className={cn(base, label ? "h-12 pt-4 pb-1.5" : "h-10", padGauche, padDroit, bordure({ error, success }), className)}
          {...props}
          onChange={(e) => {
            setRempli(e.target.value.length > 0);
            props.onChange?.(e);
          }}
        />
        {label && (
          <label htmlFor={inputId} className={cn(labelFlottant, leading && "left-9", error && "peer-focus:text-danger-fg")}>
            {label}
            {props.required && <span className="text-danger"> *</span>}
          </label>
        )}
        {estMotDePasse && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer la saisie" : "Afficher la saisie"}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xs p-1.5 text-navy-300 transition-colors duration-fast hover:bg-navy-50 hover:text-navy"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        {peutEffacer && (
          <button
            type="button"
            tabIndex={-1}
            onClick={effacer}
            aria-label="Effacer"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-navy-300 transition-colors duration-fast hover:bg-navy-50 hover:text-navy"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </motion.div>
      <MessageEtat id={messageId} error={error} success={success} />
      {hint && !error && !success && <p className="mt-1.5 text-caption text-navy-400">{hint}</p>}
    </div>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  Etat & { label?: ReactNode; hint?: ReactNode; containerClassName?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, success, hint, containerClassName, className, id, children, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const messageId = `${selectId}-message`;
  const controls = useSecousse(error);

  if (!label && !error && !success) {
    return (
      <div className="relative">
        <select ref={ref} id={selectId} className={cn(base, "h-10 appearance-none pl-3 pr-9", bordure({}), className)} {...props}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
      </div>
    );
  }

  return (
    <div className={cn("block", containerClassName)}>
      <motion.div animate={controls} className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || success ? messageId : undefined}
          className={cn(base, "h-12 appearance-none pl-3 pr-9 pt-4 pb-1.5", bordure({ error, success }), className)}
          {...props}
        >
          {children}
        </select>
        {/* Un select a toujours une valeur : l'étiquette est en position haute en permanence */}
        <label htmlFor={selectId} className="pointer-events-none absolute left-3 top-2 text-label text-navy-400 peer-focus:text-gold-600">
          {label}
          {props.required && <span className="text-danger"> *</span>}
        </label>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300 transition-transform duration-fast peer-focus:rotate-180" />
      </motion.div>
      <MessageEtat id={messageId} error={error} success={success} />
      {hint && !error && !success && <p className="mt-1.5 text-caption text-navy-400">{hint}</p>}
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Etat & { label?: ReactNode; hint?: ReactNode; containerClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, success, hint, containerClassName, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const messageId = `${areaId}-message`;
  const controls = useSecousse(error);

  if (!label && !error && !success) {
    return <textarea ref={ref} id={areaId} className={cn(base, "min-h-20 px-3 py-2", bordure({}), className)} {...props} />;
  }

  return (
    <div className={cn("block", containerClassName)}>
      <motion.div animate={controls} className="relative">
        <textarea
          ref={ref}
          id={areaId}
          placeholder={label ? " " : props.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || success ? messageId : undefined}
          className={cn(base, "min-h-24 px-3 pt-6 pb-2", bordure({ error, success }), className)}
          {...props}
        />
        {label && (
          <label
            htmlFor={areaId}
            className={cn(
              "pointer-events-none absolute left-3 top-3.5 origin-left text-body text-navy-400 transition-[top,font-size,color] duration-fast ease-linear",
              "peer-focus:top-2 peer-focus:text-label peer-focus:text-gold-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-label",
            )}
          >
            {label}
            {props.required && <span className="text-danger"> *</span>}
          </label>
        )}
      </motion.div>
      <MessageEtat id={messageId} error={error} success={success} />
      {hint && !error && !success && <p className="mt-1.5 text-caption text-navy-400">{hint}</p>}
    </div>
  );
});
