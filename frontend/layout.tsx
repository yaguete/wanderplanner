'use client'

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/components/ui/use-mobile"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  LayoutGrid,
  Settings,
  Users,
  SettingsIcon as Functions,
  Layers,
  Eye,
  BarChart2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  TicketsPlane,
  Lightbulb,
} from "lucide-react"
import { Plus } from "lucide-react"
import type { Reference, TripDay, TripItem } from "@/types/itinerary"
import { fetchItinerary } from "@/lib/api"
import ReferencesPanel from "@/components/references-panel"
import InspirationItineraryPanel from "@/components/inspiration-itinerary-panel"
import TripItineraryPanel from "@/components/trip-itinerary-panel"
import ArticleReader from "@/components/article-reader"
import AddReferenceDialog from "@/components/add-reference-dialog"

function createDay(dayNumber: number): TripDay {
  return { id: crypto.randomUUID(), dayNumber, title: "", items: [] }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState<"trips" | "inspiration">("inspiration")

  // Inspiration state
  const [references, setReferences] = useState<Reference[]>([])
  const [isLoadingReference, setIsLoadingReference] = useState(false)
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Trip state
  const [tripDays, setTripDays] = useState<TripDay[]>([createDay(1)])

  // Mobile state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatTab, setChatTab] = useState<"assistant" | "article">("assistant")
  const isMobile = useIsMobile()

  const selectedReference = references.find((r) => r.id === selectedReferenceId) ?? references[0] ?? null

  // ── Inspiration callbacks ──────────────────────────────────────────────────

  const handleAddReference = async (url: string) => {
    setIsLoadingReference(true)
    try {
      const itinerary = await fetchItinerary(url)
      const newRef: Reference = {
        id: crypto.randomUUID(),
        url,
        destination: itinerary.destination,
        totalDays: itinerary.total_days,
        ogImage: itinerary.og_image ?? null,
        articleHtml: itinerary.article_html ?? "",
        itinerary,
      }
      setReferences((prev) => [...prev, newRef])
      setSelectedReferenceId(newRef.id)
    } catch (error) {
      console.error("Failed to fetch itinerary:", error)
    } finally {
      setIsLoadingReference(false)
    }
  }

  // ── Trip callbacks ─────────────────────────────────────────────────────────

  const handleAddTripDay = useCallback(() => {
    setTripDays((prev) => [...prev, createDay(prev.length + 1)])
  }, [])

  const handleAddItemToDay = useCallback((dayId: string, item: TripItem) => {
    setTripDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, items: [...d.items, item] } : d)),
    )
  }, [])

  const handleRemoveItem = useCallback((dayId: string, itemId: string) => {
    setTripDays((prev) =>
      prev.map((d) =>
        d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d,
      ),
    )
  }, [])

  // ── Mobile layout ──────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background">
        <header className="h-14 border-b px-4 flex items-center justify-between flex-shrink-0 z-50 bg-background">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary flex-shrink-0" />
            <h1 className="text-sm font-medium">Conversation details</h1>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div className="absolute inset-0 overflow-auto">
            <div className="p-4">
              <div className="flex gap-3 border-b pb-4">
                <Button variant="secondary" size="sm" className="rounded-full">
                  Actions
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full">
                  Customer
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full">
                  Settings
                </Button>
              </div>
              <div className="pt-4 text-sm text-muted-foreground">
                Select an action to view details.
              </div>
            </div>
          </div>

          <div
            className={cn(
              "absolute inset-0 bg-black/40 backdrop-blur-[2px] z-20 transition-opacity duration-300",
              chatOpen ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            onClick={() => setChatOpen(false)}
            aria-hidden="true"
          />

          <div
            className={cn(
              "absolute inset-x-0 top-0 bottom-0 bg-background border-t rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] flex flex-col transition-transform duration-300 ease-in-out will-change-transform z-30",
              chatOpen ? "translate-y-0" : "translate-y-[calc(100%-48px)]",
            )}
          >
            <button
              className="w-full py-3 flex flex-col items-center gap-1 flex-shrink-0"
              onClick={() => setChatOpen(!chatOpen)}
              aria-label={chatOpen ? "Minimize chat" : "Open chat"}
            >
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
              {!chatOpen && <span className="text-xs font-medium text-muted-foreground">Chat</span>}
            </button>

            {chatOpen && (
              <div className="px-4 pb-0 flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Voice conversation</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setChatOpen(false)}
                  >
                    Minimize
                  </Button>
                </div>
                <div className="flex gap-2 pb-2">
                  <Button
                    variant={chatTab === "assistant" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-full h-7 text-xs"
                    onClick={() => setChatTab("assistant")}
                  >
                    Assistant
                  </Button>
                  <Button
                    variant={chatTab === "article" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-full h-7 text-xs"
                    onClick={() => setChatTab("article")}
                  >
                    Article
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {chatTab === "assistant" ? (
                children
              ) : (
                <ReferencesPanel
                  references={references}
                  onAddReference={handleAddReference}
                  isLoading={isLoadingReference}
                />
              )}
            </div>
          </div>
        </div>

        <nav className="border-t bg-background flex-shrink-0 z-50">
          <div className="flex items-center justify-around py-2">
            <BottomNavButton icon={TicketsPlane} label="Your trips" />
            <BottomNavButton icon={Lightbulb} label="Inspiration" />
            <BottomNavButton icon={Settings} label="Settings" />
          </div>
        </nav>
      </div>
    )
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div
          className={cn(
            "border-r bg-muted/10 flex flex-col transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "w-16" : "w-64",
          )}
        >
          <div className="p-4 border-b flex items-center justify-between min-h-[57px]">
            <div
              className={cn(
                "flex items-center gap-2 overflow-hidden",
                sidebarCollapsed && "justify-center w-full",
              )}
            >
              <div className="h-6 w-6 rounded-full bg-primary flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-semibold whitespace-nowrap">Wander Planner</span>
              )}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className={cn("space-y-4", sidebarCollapsed ? "p-2" : "p-4")}>
              <nav className="space-y-1">
                <SidebarButton
                  icon={TicketsPlane}
                  label="Your trips"
                  collapsed={sidebarCollapsed}
                  active={activeSection === "trips"}
                  onClick={() => setActiveSection("trips")}
                />
                <SidebarButton
                  icon={Lightbulb}
                  label="Inspiration"
                  collapsed={sidebarCollapsed}
                  active={activeSection === "inspiration"}
                  onClick={() => setActiveSection("inspiration")}
                />
              </nav>
              <div className="pt-4 border-t space-y-1">
                <SidebarButton icon={Eye} label="Live preview" collapsed={sidebarCollapsed} />
                <SidebarButton icon={BarChart2} label="Performance" collapsed={sidebarCollapsed} />
              </div>
            </div>
          </ScrollArea>
          <div
            className={cn(
              "p-2 border-t",
              sidebarCollapsed ? "flex justify-center" : "flex justify-end",
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Main content area — switches between Trips and Inspiration */}
        <div className="flex-1 flex min-w-0">
          {activeSection === "trips" ? (
            <TripsSection onAddDay={handleAddTripDay} onRemoveItem={handleRemoveItem} tripDays={tripDays}>
              {children}
            </TripsSection>
          ) : (
            <InspirationSection
              references={references}
              selectedReference={selectedReference}
              isLoadingReference={isLoadingReference}
              selectedReferenceId={selectedReferenceId}
              setSelectedReferenceId={setSelectedReferenceId}
              addDialogOpen={addDialogOpen}
              setAddDialogOpen={setAddDialogOpen}
              handleAddReference={handleAddReference}
              tripDays={tripDays}
              onAddItem={handleAddItemToDay}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

// ── Section: Your Trips ────────────────────────────────────────────────────────

function TripsSection({
  children,
  tripDays,
  onAddDay,
  onRemoveItem,
}: {
  children: React.ReactNode
  tripDays: TripDay[]
  onAddDay: () => void
  onRemoveItem: (dayId: string, itemId: string) => void
}) {
  return (
    <>
      {/* Left panel: Agent */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b px-4 flex items-center">
          <h1 className="text-sm font-medium">Agent</h1>
        </header>
        <div className="flex-1 min-h-0">{children}</div>
      </div>

      {/* Right panel: Trip itinerary */}
      <div className="flex-1 border-l min-w-0 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center">
          <h2 className="font-medium">Your itinerary</h2>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TripItineraryPanel days={tripDays} onAddDay={onAddDay} onRemoveItem={onRemoveItem} />
        </div>
      </div>
    </>
  )
}

// ── Section: Inspiration ───────────────────────────────────────────────────────

function InspirationSection({
  references,
  selectedReference,
  isLoadingReference,
  selectedReferenceId,
  setSelectedReferenceId,
  addDialogOpen,
  setAddDialogOpen,
  handleAddReference,
  tripDays,
  onAddItem,
}: {
  references: Reference[]
  selectedReference: Reference | null
  isLoadingReference: boolean
  selectedReferenceId: string | null
  setSelectedReferenceId: (id: string | null) => void
  addDialogOpen: boolean
  setAddDialogOpen: (open: boolean) => void
  handleAddReference: (url: string) => void
  tripDays: TripDay[]
  onAddItem: (dayId: string, item: TripItem) => void
}) {
  return (
    <>
      {/* Left panel: References / Article reader */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b px-4 flex items-center">
          <h1 className="text-sm font-medium">Inspiration</h1>
        </header>
        {references.length === 0 ? (
          <ReferencesPanel
            references={references}
            onAddReference={handleAddReference}
            isLoading={isLoadingReference}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 flex items-center gap-2 border-b flex-shrink-0">
              {references.map((ref) => (
                <Button
                  key={ref.id}
                  variant={selectedReference?.id === ref.id ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={() => setSelectedReferenceId(ref.id)}
                >
                  {ref.destination}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              {selectedReference && (
                <ArticleReader html={selectedReference.articleHtml} referenceUrl={selectedReference.url} />
              )}
            </div>
            <AddReferenceDialog
              open={addDialogOpen}
              onOpenChange={setAddDialogOpen}
              onSubmit={handleAddReference}
              isLoading={isLoadingReference}
            />
          </div>
        )}
      </div>

      {/* Right panel: Inspiration itinerary (from selected reference) */}
      <div className="flex-1 border-l min-w-0 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center">
          <h2 className="font-medium">
            {selectedReference ? `${selectedReference.destination} itinerary` : "Itinerary"}
          </h2>
        </header>
        {references.length > 1 && (
          <div className="px-4 py-2 flex items-center gap-2 border-b flex-shrink-0">
            {references.map((ref) => (
              <Button
                key={ref.id}
                variant={selectedReference?.id === ref.id ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setSelectedReferenceId(ref.id)}
              >
                {ref.destination}
              </Button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <InspirationItineraryPanel
            reference={selectedReference}
            isLoading={isLoadingReference}
            tripDays={tripDays}
            onAddItem={onAddItem}
          />
        </div>
      </div>
    </>
  )
}

// ── Sidebar button ─────────────────────────────────────────────────────────────

function SidebarButton({
  icon: Icon,
  label,
  collapsed,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  collapsed: boolean
  active?: boolean
  onClick?: () => void
}) {
  const button = (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start")}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", !collapsed && "mr-2")} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}

function BottomNavButton({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      className="flex flex-col items-center gap-1 px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  )
}
