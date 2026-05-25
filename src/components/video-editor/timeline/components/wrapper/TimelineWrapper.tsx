import { type DragCancelEvent as DndDragCancelEvent } from "@dnd-kit/core";
import type {
	DragEndEvent,
	DragMoveEvent,
	DragStartEvent,
	Range,
	ResizeEndEvent,
	ResizeMoveEvent,
	Span,
} from "dnd-timeline";
import { TimelineContext } from "dnd-timeline";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { TimelineRegionSpan } from "../../core/timelineTypes";
import { clampRange, resolveDragEnd, resolveResizeEnd } from "../../dnd/engine";

interface TimelineWrapperProps {
	children: ReactNode;
	range: Range;
	videoDuration: number;
	hasOverlap: (newSpan: Span, excludeId?: string, rowId?: string) => boolean;
	onRangeChange: Dispatch<SetStateAction<Range>>;
	minItemDurationMs: number;
	minVisibleRangeMs: number;
	gridSizeMs?: number;
	onItemSpanChange: (id: string, span: Span, rowId?: string) => void;
	resolveTargetRowId?: (id: string, proposedRowId: string) => string;
	allRegionSpans?: TimelineRegionSpan[];
	onLiveSpanPreviewChange?: (id: string, span: Span | null) => void;
}

export default function TimelineWrapper({
	children,
	range,
	videoDuration,
	hasOverlap,
	onRangeChange,
	minItemDurationMs,
	minVisibleRangeMs,
	gridSizeMs: _gridSizeMs,
	onItemSpanChange,
	resolveTargetRowId,
	allRegionSpans = [],
	onLiveSpanPreviewChange,
}: TimelineWrapperProps) {
	const totalMs = Math.max(0, Math.round(videoDuration * 1000));
	const tooltipFrameId = useRef<number | null>(null);
	const pendingTooltipRef = useRef<{
		span: { start: number; end: number } | null;
		screenX?: number;
	} | null>(null);
	const activeDragItemIdRef = useRef<string | null>(null);

	const onResizeEnd = useCallback(
		(event: ResizeEndEvent) => {
			const updatedSpan = event.active.data.current.getSpanFromResizeEvent?.(event);
			if (!updatedSpan) return;

			const activeItemId = event.active.id as string;
			const resolvedSpan = resolveResizeEnd(activeItemId, updatedSpan, {
				totalMs,
				minItemDurationMs,
				allRegionSpans,
				hasOverlap,
			});
			if (!resolvedSpan) return;
			onItemSpanChange(activeItemId, resolvedSpan);
		},
		[allRegionSpans, hasOverlap, minItemDurationMs, onItemSpanChange, totalMs],
	);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const proposedRowId = event.over?.id as string;
			const updatedSpan = event.active.data.current.getSpanFromDragEvent?.(event);
			if (!updatedSpan || !proposedRowId) return;

			const activeItemId = event.active.id as string;
			const resolved = resolveDragEnd(
				activeItemId,
				updatedSpan,
				proposedRowId,
				{
					allRegionSpans,
					totalMs,
					minItemDurationMs,
					hasOverlap,
				},
				resolveTargetRowId,
			);
			if (!resolved) return;
			onItemSpanChange(activeItemId, resolved.span, resolved.rowId);
		},
		[
			allRegionSpans,
			hasOverlap,
			minItemDurationMs,
			onItemSpanChange,
			resolveTargetRowId,
			totalMs,
		],
	);

	// Drag/resize tooltip (direct DOM updates, no re-renders)
	const tooltipRef = useRef<HTMLDivElement>(null);
	const tooltipLayout = useRef({
		text: "",
		leftPx: 0,
		visible: false,
	});

	const formatTooltipMs = useCallback((ms: number) => {
		const s = ms / 1000;
		const min = Math.floor(s / 60);
		const sec = s % 60;
		return min > 0 ? `${min}:${sec.toFixed(1).padStart(4, "0")}` : `${sec.toFixed(1)}s`;
	}, []);

	const setTooltipVisuals = useCallback(
		(span: { start: number; end: number } | null, screenX?: number) => {
			const el = tooltipRef.current;
			if (!el) return;
			if (!span) {
				if (tooltipLayout.current.visible) {
					tooltipLayout.current.visible = false;
					el.style.opacity = "0";
				}
				return;
			}
			const nextText = `${formatTooltipMs(span.start)} – ${formatTooltipMs(span.end)}`;
			if (nextText !== tooltipLayout.current.text) {
				tooltipLayout.current.text = nextText;
				el.textContent = nextText;
			}

			if (!tooltipLayout.current.visible) {
				tooltipLayout.current.visible = true;
				el.style.opacity = "1";
			}

			if (screenX !== undefined) {
				const parent = el.parentElement;
				if (parent) {
					const rect = parent.getBoundingClientRect();
					const tooltipWidth = Math.max(el.offsetWidth, 56);
					const x = Math.max(0, Math.min(screenX - rect.left, rect.width - tooltipWidth));
					if (tooltipLayout.current.leftPx !== x) {
						tooltipLayout.current.leftPx = x;
						el.style.left = `${x}px`;
					}
				}
			}
		},
		[formatTooltipMs],
	);
	const queueTooltip = useCallback(
		(span: { start: number; end: number } | null, screenX?: number) => {
			pendingTooltipRef.current = { span, screenX };
			if (tooltipFrameId.current !== null) return;
			if (typeof requestAnimationFrame === "undefined") {
				setTooltipVisuals(span, screenX);
				pendingTooltipRef.current = null;
				return;
			}
			tooltipFrameId.current = requestAnimationFrame(() => {
				tooltipFrameId.current = null;
				const pending = pendingTooltipRef.current;
				pendingTooltipRef.current = null;
				if (!pending) return;
				setTooltipVisuals(pending.span, pending.screenX);
			});
		},
		[setTooltipVisuals],
	);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			activeDragItemIdRef.current = event.active.id as string;
			const span = event.active.data.current.getSpanFromDragEvent?.(event);
			if (span) queueTooltip(span);
		},
		[queueTooltip],
	);

	const onDragMove = useCallback(
		(event: DragMoveEvent) => {
			const span = event.active.data.current.getSpanFromDragEvent?.(event);
			const screenX =
				event.activatorEvent && "clientX" in event.activatorEvent
					? (event.activatorEvent as PointerEvent).clientX + (event.delta?.x ?? 0)
					: undefined;
			activeDragItemIdRef.current = event.active.id as string;
			if (span) queueTooltip(span, screenX);
			const moved = Math.hypot(event.delta?.x ?? 0, event.delta?.y ?? 0) > 0.01;
			if (moved) {
				onLiveSpanPreviewChange?.(event.active.id as string, span ?? null);
			}
		},
		[onLiveSpanPreviewChange, queueTooltip],
	);

	const onResizeMove = useCallback(
		(event: ResizeMoveEvent) => {
			const span = event.active.data.current.getSpanFromResizeEvent?.(event);
			const screenX =
				event.activatorEvent && "clientX" in event.activatorEvent
					? (event.activatorEvent as PointerEvent).clientX + (event.delta?.x ?? 0)
					: undefined;
			activeDragItemIdRef.current = event.active.id as string;
			if (span) queueTooltip(span, screenX);
			onLiveSpanPreviewChange?.(event.active.id as string, span ?? null);
		},
		[onLiveSpanPreviewChange, queueTooltip],
	);

	const clearDragState = useCallback(() => {
		const activeDragId = activeDragItemIdRef.current;
		if (activeDragId) {
			onLiveSpanPreviewChange?.(activeDragId, null);
			activeDragItemIdRef.current = null;
		}
		queueTooltip(null);
	}, [onLiveSpanPreviewChange, queueTooltip]);

	const hideTooltip = useCallback(() => queueTooltip(null), [queueTooltip]);
	const handleDragCancel = useCallback(
		(event: DndDragCancelEvent) => {
			if (event.active.id) {
				onLiveSpanPreviewChange?.(event.active.id as string, null);
				activeDragItemIdRef.current = null;
			}
			hideTooltip();
		},
		[hideTooltip, onLiveSpanPreviewChange],
	);

	const onResizeEndWithTooltip = useCallback(
		(event: ResizeEndEvent) => {
			clearDragState();
			onResizeEnd(event);
		},
		[clearDragState, onResizeEnd],
	);

	const onDragEndWithTooltip = useCallback(
		(event: DragEndEvent) => {
			clearDragState();
			onDragEnd(event);
		},
		[clearDragState, onDragEnd],
	);

	const handleRangeChange = useCallback(
		(updater: (previous: Range) => Range) => {
			onRangeChange((prev) => {
				const normalized =
					totalMs > 0 ? clampRange(prev, { totalMs, minVisibleRangeMs }) : prev;
				const desired = updater(normalized);

				if (totalMs > 0) {
					return clampRange(desired, { totalMs, minVisibleRangeMs });
				}

				return desired;
			});
		},
		[minVisibleRangeMs, onRangeChange, totalMs],
	);

	useEffect(() => {
		return () => {
			if (tooltipFrameId.current !== null) {
				cancelAnimationFrame(tooltipFrameId.current);
				tooltipFrameId.current = null;
			}
			clearDragState();
		};
	}, [clearDragState]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const handleGlobalDragStop = () => {
			clearDragState();
		};

		window.addEventListener("pointerup", handleGlobalDragStop);
		window.addEventListener("pointercancel", handleGlobalDragStop);
		window.addEventListener("blur", handleGlobalDragStop);

		return () => {
			window.removeEventListener("pointerup", handleGlobalDragStop);
			window.removeEventListener("pointercancel", handleGlobalDragStop);
			window.removeEventListener("blur", handleGlobalDragStop);
			clearDragState();
		};
	}, [clearDragState]);

	return (
		<TimelineContext
			range={range}
			onRangeChanged={handleRangeChange}
			onResizeEnd={onResizeEndWithTooltip}
			onResizeMove={onResizeMove}
			onDragStart={onDragStart}
			onDragMove={onDragMove}
			onDragEnd={onDragEndWithTooltip}
			onDragCancel={handleDragCancel}
			autoScroll={{ enabled: false }}
			resizeHandleWidth={28}
		>
			<div className="relative h-full min-h-0">
				{children}
				{/* Floating tooltip shown during drag/resize */}
				<div
					ref={tooltipRef}
					className="absolute top-1 pointer-events-none z-[60] px-1.5 py-0.5 rounded bg-editor-bg/90 text-[10px] text-foreground/90 font-medium tabular-nums whitespace-nowrap border border-foreground/10 shadow-lg"
					style={{ opacity: 0, transition: "opacity 0.1s" }}
				/>
			</div>
		</TimelineContext>
	);
}
