"use client"

/**
 * Cápsula de búsqueda de destino (landing y diálogo «Añadir fuente»).
 * El fetch y el listado viven en el padre: aquí solo el campo.
 */
import type { FormEvent, Ref } from "react"
import { ArrowRight, Loader2 } from "lucide-react"

export function DestinationSearchField({
  id,
  value,
  onChange,
  onSubmit,
  loading = false,
  inputRef,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading?: boolean
  inputRef?: Ref<HTMLInputElement>
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="landing-start-field">
      <label htmlFor={id} className="sr-only">
        Destino
      </label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        enterKeyHint="search"
        placeholder="Japón, Vietnam, Islandia…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="landing-start-input"
      />
      <button type="submit" className="landing-start-go" aria-label="Buscar artículos">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4" aria-hidden />
        )}
      </button>
    </form>
  )
}
