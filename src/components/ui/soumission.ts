"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Soumission d'un formulaire lié à une Server Action SANS réinitialisation
 * automatique des champs.
 *
 * React 19 vide un formulaire non contrôlé dès que l'action passée à
 * `<form action>` se termine — y compris quand elle renvoie une erreur de
 * validation : l'utilisateur perdait tout ce qu'il avait saisi (banque, dates,
 * porteur…) pour un montant refusé. En dispatchant l'action nous-mêmes depuis
 * `onSubmit`, les valeurs restent en place et seules les erreurs s'affichent.
 * `pending` de `useActionState` continue de fonctionner. Les formulaires qui
 * veulent se vider après un succès le font explicitement (`form.reset()`).
 *
 *   <form action={formAction} onSubmit={soumettreSansReinitialiser(formAction)}>
 */
export function soumettreSansReinitialiser(formAction: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter ?? undefined);
    startTransition(() => formAction(formData));
  };
}
