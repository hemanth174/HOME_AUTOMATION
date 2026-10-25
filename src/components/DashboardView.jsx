"use client";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import Loader from "@/components/Loader";
import Toast from "@/components/Toast";
import VoiceControl from "@/components/VoiceControl";
import AddBoardModal from "@/components/AddBoardModal";
import EditBoardModal from "@/components/EditBoardModal";
import QuickPresets from "@/components/QuickPresets";
import RoomList from "@/components/pg/RoomList";
import DeviceCard from "@/components/pg/DeviceCard";
import OverviewCards from "@/components/pg/OverviewCards";
import EnergyPanel from "@/components/pg/EnergyPanel";
import ActivityFeed from "@/components/pg/ActivityFeed";
import { isBoardOnline } from "@/components/pg/deviceKind";

export default function DashboardView({ c }) {
  if (c.loading) return <Loader message="Loading VikaTech Dashboard..." />;

  const button = (label, Icon, onClick) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl border border-(--pg-line) bg-(--pg-card) px-3.5 text-xs font-extrabold text-(--pg-ink) cursor-pointer"
    >
      <Icon size={14} />
      <span className="max-sm:hidden">{label}</span>
    </button>
  );

  const scrollDeviceCarousel = (direction) => {
    const carousel = c.carouselRef.current;
    if (!carousel) return;
    const firstCard = carousel.querySelector("article");
    const distance = firstCard
      ? firstCard.getBoundingClientRect().width + 12
      : carousel.clientWidth;
    carousel.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  const selectedBoard = c.selectedBoard;
  const selectedDevices = c.selectedDevices;
  const roomExpanded = selectedBoard
    ? c.expandedBoards?.[selectedBoard.id] !== false
    : true;

  return (
    <>
      <div className="dashboard-container animate-fade-up">
        <OverviewCards
          userName={
            c.user?.user_metadata?.full_name ||
            c.user?.email?.split("@")[0] ||
            "there"
          }
          statusMessage={c.statusMessage}
          totalDevices={c.devices.length}
          activeDevices={c.activeCount}
          energyKwhToday={c.energyKwhToday}
          energyAvailable={c.devices.length > 0}
          liveWatts={c.liveWatts}
          systemOk={c.systemOk}
          systemMessage={c.systemMessage}
        />

        {!c.boards.length ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-(--pg-line) bg-(--pg-card) p-10 text-center max-w-lg mx-auto gap-4">
            <Cpu size={28} className="text-(--pg-brand)" />
            <h3 className="text-base font-extrabold text-(--pg-ink)">
              No Rooms Registered Yet
            </h3>
            <p className="text-xs text-(--pg-muted)">
              To start controlling your PG, add your first room controller
              (ESP32 board).
            </p>
            <button
              onClick={() => c.setShowAddBoardModal(true)}
              className="rounded-xl bg-(--pg-brand) px-5 py-3 text-xs font-extrabold text-(--pg-onbrand) cursor-pointer transition-colors hover:bg-(--pg-brand-hover)"
            >
              Add Your First Room
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
                 <section className="boards-section-selector min-w-0 rounded-2xl border border-(--pg-line) bg-(--pg-card) p-3 sm:p-5 lg:order-2">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
                  <div className="min-w-0 flex-1">
                    <h2
                      className="text-lg font-extrabold truncate"
                      title={selectedBoard?.name}
                    >
                      {selectedBoard?.name}
                    </h2>
                    <p className="text-xs font-semibold text-(--pg-muted) mt-1">
                      {selectedDevices.length} device
                      {selectedDevices.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.viewSwitcherEnabled && roomExpanded ? (
                      <div
                        className="flex items-center rounded-xl border border-(--pg-line) bg-(--pg-card) p-0.5"
                        aria-label="Device view options"
                      >
                        <button
                          type="button"
                          onClick={() => c.changeDeviceView("list")}
                          aria-label="List view"
                          aria-pressed={c.deviceView === "list"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
                            c.deviceView === "list"
                              ? "bg-(--pg-deep) text-(--pg-on-deep)"
                              : "text-(--pg-muted) hover:text-(--pg-ink)"
                          }`}
                        >
                          <List size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => c.changeDeviceView("carousel")}
                          aria-label="Carousel view"
                          aria-pressed={c.deviceView === "carousel"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
                            c.deviceView === "carousel"
                              ? "bg-(--pg-deep) text-(--pg-on-deep)"
                              : "text-(--pg-muted) hover:text-(--pg-ink)"
                          }`}
                        >
                          <LayoutGrid size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}

                    {button("Room On", Power, () =>
                      c.boardControl(
                        selectedBoard.id,
                        selectedBoard.name,
                        true,
                      ),
                    )}
                    {button("Room Off", PowerOff, () =>
                      c.boardControl(
                        selectedBoard.id,
                        selectedBoard.name,
                        false,
                      ),
                    )}
                    <button
                      onClick={() => {
                        c.setEditingBoardObj(selectedBoard);
                        c.setShowEditBoardModal(true);
                      }}
                      title="Rename room and devices"
                      aria-label="Rename room and devices"
                      className="inline-flex min-h-[36px] w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) hover:border-(--pg-brand-line) hover:text-(--pg-brand) transition-all cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => c.toggleRoomCollapsed(selectedBoard.id)}
                      title={roomExpanded ? "Collapse room" : "Expand room"}
                      aria-label={
                        roomExpanded ? "Collapse room" : "Expand room"
                      }
                      aria-expanded={roomExpanded}
                      className="inline-flex min-h-[36px] w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) hover:border-(--pg-brand-line) hover:text-(--pg-brand) transition-all cursor-pointer"
                    >
                      <ChevronDown
                        size={15}
                        className={`transition-transform duration-300 ${roomExpanded ? "" : "-rotate-90"}`}
                      />
                    </button>
                  </div>
                </div>

                {roomExpanded && (
                  <>
                    {selectedDevices.length === 0 ? (
                      <p className="py-8 text-center text-xs font-semibold text-(--pg-muted)">
                        No devices in this room.
                      </p>
                    ) : (
                      <div
                        id="device-carousel"
                        ref={c.carouselRef}
                        className={
                          c.deviceView === "carousel"
                            ? "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth overscroll-x-contain pb-1"
                            : "grid sm:grid-cols-2 gap-2.5"
                        }
                        aria-label="Local devices carousel"
                        onScroll={c.saveDeviceIndex}
                      >
                        {selectedDevices.map((device) => (
                          <DeviceCard
                            key={device.id}
                            device={device}
                            roomName={selectedBoard.name}
                            boardOnline={isBoardOnline(selectedBoard)}
                            pending={c.pending[device.id] !== undefined}
                            onToggle={() => c.toggleDevice(device)}
                            carousel={c.deviceView === "carousel"}
                          />
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-4 border-t border-(--pg-line)">
                      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-(--pg-muted) mr-1">
                        Property
                      </span>
                      {button("All On", Power, c.turnAllDevicesOn)}
                      {button("All Off", PowerOff, c.turnAllDevicesOff)}
                      {c.deviceView === "carousel" && (
                        <div className="ml-auto flex items-center gap-1.5 sm:hidden">
                          <button
                            type="button"
                            onClick={() => scrollDeviceCarousel(-1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) transition hover:border-(--pg-brand-line) hover:text-(--pg-brand)"
                            aria-label="Previous device"
                            aria-controls="device-carousel"
                          >
                            <ChevronLeft size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollDeviceCarousel(1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) transition hover:border-(--pg-brand-line) hover:text-(--pg-brand)"
                            aria-label="Next device"
                            aria-controls="device-carousel"
                          >
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
              <div className="lg:order-1 rounded-2xl border border-(--pg-line) bg-(--pg-card) p-3">
                <RoomList
                  boards={c.boards}
                  devices={c.devices}
                  selectedId={selectedBoard?.id}
                  onSelect={c.selectBoard}
                />
                <button
                  onClick={() => c.setShowAddBoardModal(true)}
                  className="mt-2 w-full inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed text-xs font-extrabold cursor-pointer"
                >
                  <Plus size={14} />
                  Add Room
                </button>
              </div>

            </div>

            {(c.hasPresets || c.hasEnergyHistory) && (
              <div className="grid gap-4 lg:grid-cols-2 mt-4">
                {c.hasPresets && (
                  <QuickPresets
                    presets={c.presets}
                    isPresetActive={c.isPresetActive}
                    applyPreset={c.applyPreset}
                    deletePreset={c.deletePreset}
                  />
                )}
                {c.hasEnergyHistory && <EnergyPanel dailyRows={c.dailyRows} />}
              </div>
            )}

            <div className="mt-4">
              <ActivityFeed logs={c.todayLogs} deviceRoom={c.deviceRoom} />
            </div>
          </>
        )}
      </div>

      <AddBoardModal
        showAddBoardModal={c.showAddBoardModal}
        setShowAddBoardModal={c.setShowAddBoardModal}
        boardIdentifier={c.boardIdentifier}
        setBoardIdentifier={c.setBoardIdentifier}
        boardName={c.boardName}
        setBoardName={c.setBoardName}
        addBoard={c.addBoard}
      />
      <EditBoardModal
        showEditBoardModal={c.showEditBoardModal}
        setShowEditBoardModal={c.setShowEditBoardModal}
        editingBoardObj={c.editingBoardObj}
        editingBoardDevices={
          c.editingBoardObj ? c.getDevicesForBoard(c.editingBoardObj.id) : []
        }
        saveFullBoardEdit={c.saveFullBoardEdit}
      />
      <VoiceControl
        devices={c.devices}
        boards={c.boards}
        presets={c.presets}
        applyPreset={c.applyPreset}
        controlDevice={c.controlDevice}
        controlAll={c.controlAll}
        onToast={c.showToast}
      />
      <Toast message={c.toast} onClose={() => c.showToast("")} />
    </>
  );
}
