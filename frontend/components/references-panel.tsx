'use client'

import { useState } from "react"
import type { Reference } from "@/types/itinerary"
import ReferenceCard from "@/components/reference-card"
import AddReferenceDialog from "@/components/add-reference-dialog"
import { Plus } from "lucide-react"

interface ReferencesPanelProps {
  references: Reference[]
  onAddReference: (url: string) => void
  isLoading: boolean
}

export default function ReferencesPanel({
  references,
  onAddReference,
  isLoading,
}: ReferencesPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleSubmit = (url: string) => {
    onAddReference(url)
  }

  return (
    <div className="flex-1 p-4">
      <div className="flex flex-wrap gap-4">
        {references.map((ref) => (
          <ReferenceCard key={ref.id} reference={ref} />
        ))}

        {/* Add Reference card */}
        <button
          onClick={() => setDialogOpen(true)}
          className="w-44 h-52 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-8 w-8 text-muted-foreground/50" />
          <span className="text-sm text-muted-foreground">Add reference</span>
        </button>
      </div>

      <AddReferenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}
