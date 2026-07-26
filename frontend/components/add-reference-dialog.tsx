'use client'

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface AddReferenceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (url: string) => void
  isLoading: boolean
}

export default function AddReferenceDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: AddReferenceDialogProps) {
  const [url, setUrl] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    onSubmit(url.trim())
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) setUrl("")
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a reference</DialogTitle>
            <DialogDescription>
              Paste a travel blog or article URL
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!url.trim() || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
