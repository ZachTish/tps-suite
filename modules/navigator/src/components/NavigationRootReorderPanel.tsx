/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useCallback, useMemo } from 'react';
import { DndContext, MouseSensor, TouchSensor, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RootFolderReorderItem } from './RootFolderReorderItem';
import { strings } from '../i18n';
import type { SectionReorderRenderItem, RootReorderRenderItem } from '../hooks/useNavigationRootReorder';
import { NavigationSectionId } from '../types';
import { runAsyncAction } from '../utils/async';
import { ObsidianIcon } from './ObsidianIcon';
import type { TypeNavigationSortOrder } from '../settings/types';
import {
    ROOT_REORDER_MOUSE_CONSTRAINT,
    ROOT_REORDER_TOUCH_CONSTRAINT,
    typeFilteredCollisionDetection,
    verticalAxisOnly
} from '../utils/dndConfig';

interface NavigationRootReorderPanelProps {
    sectionItems: SectionReorderRenderItem[];
    folderItems: RootReorderRenderItem[];
    tagItems: RootReorderRenderItem[];
    propertyItems: RootReorderRenderItem[];
    typeItems: RootReorderRenderItem[];
    isMobile: boolean;
    showRootFolderSection: boolean;
    showRootTagSection: boolean;
    showRootPropertySection: boolean;
    showRootTypeSection: boolean;
    foldersSectionExpanded: boolean;
    tagsSectionExpanded: boolean;
    propertiesSectionExpanded: boolean;
    typesSectionExpanded: boolean;
    showRootFolderReset: boolean;
    showRootTagReset: boolean;
    showRootPropertyReset: boolean;
    typeNavigationSortOrder: TypeNavigationSortOrder;
    resetRootTagOrderLabel: string;
    resetRootPropertyOrderLabel: string;
    onResetRootFolderOrder: () => Promise<void> | void;
    onResetRootTagOrder: () => Promise<void> | void;
    onResetRootPropertyOrder: () => Promise<void> | void;
    onReorderSections: (orderedKeys: NavigationSectionId[]) => Promise<void> | void;
    onReorderFolders: (orderedKeys: string[]) => Promise<void> | void;
    onReorderTags: (orderedKeys: string[]) => Promise<void> | void;
    onReorderProperties: (orderedKeys: string[]) => Promise<void> | void;
    onReorderTypes: (orderedKeys: string[]) => Promise<void> | void;
    onTypeNavigationSortOrderChange: (sortOrder: TypeNavigationSortOrder, visibleOrder: string[]) => Promise<void> | void;
    canReorderSections: boolean;
    canReorderFolders: boolean;
    canReorderTags: boolean;
    canReorderProperties: boolean;
    canReorderTypes: boolean;
}

const RESET_FOLDER_LABEL = strings.navigationPane.resetRootToAlpha;

interface RootSortableEntry {
    sortableId: string;
    item: RootReorderRenderItem;
}

interface SortableItemProps {
    entry: RootSortableEntry;
    canReorder: boolean;
    isMobile: boolean;
}

function SortableRootItem({ entry, canReorder, isMobile }: SortableItemProps) {
    const { item, sortableId } = entry;
    const { attributes, listeners, setNodeRef, transform, transition, isSorting } = useSortable({
        id: sortableId,
        disabled: !canReorder,
        data: { type: item.props.itemType }
    });

    const dragStyle = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;
    const dragHandleConfig = useMemo(
        () => ({
            visible: isMobile && canReorder,
            icon: 'lucide-grip-horizontal',
            interactive: isMobile && canReorder,
            only: isMobile
        }),
        [canReorder, isMobile]
    );

    return (
        <RootFolderReorderItem
            {...item.props}
            dragRef={setNodeRef}
            dragAttributes={attributes}
            dragListeners={listeners}
            dragStyle={dragStyle}
            isSorting={isSorting}
            dragHandleConfig={dragHandleConfig}
        />
    );
}

interface SortableListProps {
    entries: RootSortableEntry[];
    canReorder: boolean;
    children?: React.ReactNode;
    isMobile: boolean;
}

function SortableList({ entries, canReorder, children, isMobile }: SortableListProps) {
    const itemIds = useMemo(() => entries.map(entry => entry.sortableId), [entries]);
    return (
        <>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                {entries.map(entry => (
                    <SortableRootItem key={entry.sortableId} entry={entry} canReorder={canReorder} isMobile={isMobile} />
                ))}
            </SortableContext>
            {children}
        </>
    );
}

interface SectionEntry {
    id: NavigationSectionId;
    item: SectionReorderRenderItem;
}

interface ResetActionProps {
    label: string;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function ResetAction({ label, onClick }: ResetActionProps) {
    return (
        <div className="nn-root-reorder-actions">
            <button type="button" className="nn-root-reorder-reset nn-support-button" onClick={onClick}>
                <span className="nn-root-reorder-reset-icon" aria-hidden="true">
                    Aa
                </span>
                <span>{label}</span>
            </button>
        </div>
    );
}

interface TypeOrderControlProps {
    value: TypeNavigationSortOrder;
    onChange: (sortOrder: TypeNavigationSortOrder) => void;
}

function TypeOrderControl({ value, onChange }: TypeOrderControlProps) {
    return (
        <label className="nn-root-reorder-type-order">
            <span className="nn-root-reorder-type-order-label">Type order</span>
            <select
                className="dropdown nn-root-reorder-type-order-select"
                aria-label="Type order"
                value={value}
                onChange={event => onChange(event.currentTarget.value as TypeNavigationSortOrder)}
            >
                <option value="catalog">Default order</option>
                <option value="alpha-asc">Name: A to Z</option>
                <option value="alpha-desc">Name: Z to A</option>
                <option value="count-desc">Most items first</option>
                <option value="count-asc">Fewest items first</option>
                <option value="manual">Manual order</option>
            </select>
        </label>
    );
}

export function NavigationRootReorderPanel({
    sectionItems,
    folderItems,
    tagItems,
    propertyItems,
    typeItems,
    isMobile,
    showRootFolderSection,
    showRootTagSection,
    showRootPropertySection,
    showRootTypeSection,
    foldersSectionExpanded,
    tagsSectionExpanded,
    propertiesSectionExpanded,
    typesSectionExpanded,
    showRootFolderReset,
    showRootTagReset,
    showRootPropertyReset,
    typeNavigationSortOrder,
    resetRootTagOrderLabel,
    resetRootPropertyOrderLabel,
    onResetRootFolderOrder,
    onResetRootTagOrder,
    onResetRootPropertyOrder,
    onReorderSections,
    onReorderFolders,
    onReorderTags,
    onReorderProperties,
    onReorderTypes,
    onTypeNavigationSortOrderChange,
    canReorderSections,
    canReorderFolders,
    canReorderTags,
    canReorderProperties,
    canReorderTypes
}: NavigationRootReorderPanelProps) {
    const handleResetFolders = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            runAsyncAction(async () => {
                await onResetRootFolderOrder();
            });
        },
        [onResetRootFolderOrder]
    );

    const handleResetTags = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            runAsyncAction(async () => {
                await onResetRootTagOrder();
            });
        },
        [onResetRootTagOrder]
    );

    const handleResetProperties = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            runAsyncAction(async () => {
                await onResetRootPropertyOrder();
            });
        },
        [onResetRootPropertyOrder]
    );

    const sectionEntries = useMemo<SectionEntry[]>(() => {
        return sectionItems.map(item => ({
            id: item.key as NavigationSectionId,
            item
        }));
    }, [sectionItems]);

    const folderEntries = useMemo<RootSortableEntry[]>(() => {
        return folderItems.map(item => ({
            sortableId: `folder:${item.key}`,
            item
        }));
    }, [folderItems]);

    const tagEntries = useMemo<RootSortableEntry[]>(() => {
        return tagItems.map(item => ({
            sortableId: `tag:${item.key}`,
            item
        }));
    }, [tagItems]);

    const propertyEntries = useMemo<RootSortableEntry[]>(() => {
        return propertyItems.map(item => ({
            sortableId: `property:${item.key}`,
            item
        }));
    }, [propertyItems]);

    const typeEntries = useMemo<RootSortableEntry[]>(() => {
        return typeItems.map(item => ({
            sortableId: `type:${item.key}`,
            item
        }));
    }, [typeItems]);

    const sortableRegistry = useMemo(() => {
        const map = new Map<string, { type: 'folder' | 'tag' | 'property' | 'type'; key: string }>();
        folderEntries.forEach(entry => {
            map.set(entry.sortableId, { type: 'folder', key: entry.item.key });
        });
        tagEntries.forEach(entry => {
            map.set(entry.sortableId, { type: 'tag', key: entry.item.key });
        });
        propertyEntries.forEach(entry => {
            map.set(entry.sortableId, { type: 'property', key: entry.item.key });
        });
        typeEntries.forEach(entry => {
            map.set(entry.sortableId, { type: 'type', key: entry.item.key });
        });
        return map;
    }, [folderEntries, propertyEntries, tagEntries, typeEntries]);

    const sectionIds = useMemo(() => sectionEntries.map(entry => entry.id), [sectionEntries]);
    const folderIds = useMemo(() => folderEntries.map(entry => entry.item.key), [folderEntries]);
    const tagIds = useMemo(() => tagEntries.map(entry => entry.item.key), [tagEntries]);
    const propertyIds = useMemo(() => propertyEntries.map(entry => entry.item.key), [propertyEntries]);
    const typeIds = useMemo(() => typeEntries.map(entry => entry.item.key), [typeEntries]);
    const sectionIndexMap = useMemo(() => {
        return new Map<NavigationSectionId, number>(sectionIds.map((id, index) => [id, index]));
    }, [sectionIds]);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: ROOT_REORDER_MOUSE_CONSTRAINT }),
        useSensor(TouchSensor, { activationConstraint: ROOT_REORDER_TOUCH_CONSTRAINT })
    );

    const moveSection = useCallback(
        (sectionId: NavigationSectionId, delta: number) => {
            if (!canReorderSections) {
                return;
            }
            const currentIndex = sectionIds.indexOf(sectionId);
            const targetIndex = currentIndex + delta;
            if (currentIndex === -1 || targetIndex < 0 || targetIndex >= sectionIds.length) {
                return;
            }
            const next = arrayMove(sectionIds, currentIndex, targetIndex);
            runAsyncAction(async () => {
                await onReorderSections(next);
            });
        },
        [canReorderSections, onReorderSections, sectionIds]
    );

    const createSectionMoveHandler = useCallback(
        (sectionId: NavigationSectionId, delta: number) => {
            return (event: React.MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
                moveSection(sectionId, delta);
            };
        },
        [moveSection]
    );

    const moveType = useCallback(
        (typeId: string, delta: number) => {
            if (!canReorderTypes) {
                return;
            }
            const currentIndex = typeIds.indexOf(typeId);
            const targetIndex = currentIndex + delta;
            if (currentIndex === -1 || targetIndex < 0 || targetIndex >= typeIds.length) {
                return;
            }
            const next = arrayMove(typeIds, currentIndex, targetIndex);
            runAsyncAction(async () => {
                await onReorderTypes(next);
            });
        },
        [canReorderTypes, onReorderTypes, typeIds]
    );

    const createTypeMoveHandler = useCallback(
        (typeId: string, delta: number) => {
            return (event: React.MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
                moveType(typeId, delta);
            };
        },
        [moveType]
    );

    const typeEntriesWithControls = useMemo<RootSortableEntry[]>(() => {
        return typeEntries.map((entry, index) => {
            const label = entry.item.props.label;
            const trailingAccessory = canReorderTypes ? (
                <div className="nn-root-reorder-type-controls">
                    <button
                        type="button"
                        className="nn-icon-button nn-root-reorder-type-button"
                        aria-label={`${strings.settings.items.vaultProfiles.moveUp}: ${label}`}
                        onClick={createTypeMoveHandler(entry.item.key, -1)}
                        disabled={index === 0}
                    >
                        <ObsidianIcon name="lucide-arrow-up" />
                    </button>
                    <button
                        type="button"
                        className="nn-icon-button nn-root-reorder-type-button"
                        aria-label={`${strings.settings.items.vaultProfiles.moveDown}: ${label}`}
                        onClick={createTypeMoveHandler(entry.item.key, 1)}
                        disabled={index === typeEntries.length - 1}
                    >
                        <ObsidianIcon name="lucide-arrow-down" />
                    </button>
                </div>
            ) : undefined;

            return {
                ...entry,
                item: {
                    ...entry.item,
                    props: {
                        ...entry.item.props,
                        trailingAccessory
                    }
                }
            };
        });
    }, [canReorderTypes, createTypeMoveHandler, typeEntries]);

    const handleTypeSortOrderChange = useCallback(
        (sortOrder: TypeNavigationSortOrder) => {
            runAsyncAction(async () => {
                await onTypeNavigationSortOrderChange(sortOrder, typeIds);
            });
        },
        [onTypeNavigationSortOrderChange, typeIds]
    );

    const handlePropertyDragEnd = useCallback(
        (activeKey: string, overKey: string) => {
            if (!canReorderProperties) {
                return;
            }
            const oldIndex = propertyIds.indexOf(activeKey);
            const newIndex = propertyIds.indexOf(overKey);
            if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
                return;
            }
            const next = arrayMove(propertyIds, oldIndex, newIndex);
            runAsyncAction(async () => {
                await onReorderProperties(next);
            });
        },
        [canReorderProperties, onReorderProperties, propertyIds]
    );

    const hasSortableContent =
        sectionEntries.length > 0 ||
        (showRootFolderSection && folderEntries.length > 0) ||
        (showRootTagSection && tagEntries.length > 0) ||
        (showRootPropertySection && propertyEntries.length > 0) ||
        (showRootTypeSection && typeItems.length > 0);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const activeId = event.active.id as string;
            const overId = event.over?.id as string | undefined;
            if (!overId) {
                return;
            }

            const active = sortableRegistry.get(activeId);
            const over = sortableRegistry.get(overId);
            if (!active || !over) {
                return;
            }
            if (active.type !== over.type) {
                return;
            }

            if (active.type === 'folder') {
                if (!canReorderFolders) {
                    return;
                }
                const oldIndex = folderIds.indexOf(active.key);
                const newIndex = folderIds.indexOf(over.key);
                if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
                    return;
                }
                const next = arrayMove(folderIds, oldIndex, newIndex);
                runAsyncAction(async () => {
                    await onReorderFolders(next);
                });
                return;
            }

            if (active.type === 'tag') {
                if (!canReorderTags) {
                    return;
                }
                const oldIndex = tagIds.indexOf(active.key);
                const newIndex = tagIds.indexOf(over.key);
                if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
                    return;
                }
                const next = arrayMove(tagIds, oldIndex, newIndex);
                runAsyncAction(async () => {
                    await onReorderTags(next);
                });
                return;
            }

            if (active.type === 'type') {
                if (!canReorderTypes) {
                    return;
                }
                const oldIndex = typeIds.indexOf(active.key);
                const newIndex = typeIds.indexOf(over.key);
                if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
                    return;
                }
                const next = arrayMove(typeIds, oldIndex, newIndex);
                runAsyncAction(async () => {
                    await onReorderTypes(next);
                });
                return;
            }

            handlePropertyDragEnd(active.key, over.key);
        },
        [
            canReorderFolders,
            canReorderTags,
            canReorderTypes,
            folderIds,
            handlePropertyDragEnd,
            onReorderFolders,
            onReorderTags,
            onReorderTypes,
            sortableRegistry,
            tagIds,
            typeIds
        ]
    );

    return (
        <div className="nn-root-reorder-panel">
            <div className="nn-root-reorder-header">
                <span className="nn-root-reorder-title">{strings.navigationPane.reorderRootFoldersTitle}</span>
                <span className="nn-root-reorder-hint">{strings.navigationPane.reorderRootFoldersHint}</span>
            </div>

            <div className="nn-root-reorder-list" role="presentation">
                {hasSortableContent ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={typeFilteredCollisionDetection}
                        modifiers={[verticalAxisOnly]}
                        onDragEnd={handleDragEnd}
                    >
                        {sectionEntries.length > 0 ? (
                            sectionEntries.map(entry => {
                                const item = entry.item;
                                const sectionId = entry.id;
                                const sectionIndex = sectionIndexMap.get(sectionId) ?? -1;
                                const canMoveUp = canReorderSections && sectionIndex > 0;
                                const canMoveDown = canReorderSections && sectionIndex >= 0 && sectionIndex < sectionIds.length - 1;
                                const showControls = canReorderSections && sectionIds.length > 1;
                                const trailingAccessory = showControls ? (
                                    <div className="nn-root-reorder-section-controls">
                                        <button
                                            type="button"
                                            className="nn-icon-button nn-root-reorder-section-button"
                                            aria-label={strings.settings.items.vaultProfiles.moveUp}
                                            onClick={createSectionMoveHandler(sectionId, -1)}
                                            disabled={!canMoveUp}
                                        >
                                            <ObsidianIcon name="lucide-arrow-up" />
                                        </button>
                                        <button
                                            type="button"
                                            className="nn-icon-button nn-root-reorder-section-button"
                                            aria-label={strings.settings.items.vaultProfiles.moveDown}
                                            onClick={createSectionMoveHandler(sectionId, 1)}
                                            disabled={!canMoveDown}
                                        >
                                            <ObsidianIcon name="lucide-arrow-down" />
                                        </button>
                                    </div>
                                ) : undefined;

                                const shouldRenderFolders =
                                    item.sectionId === NavigationSectionId.FOLDERS && foldersSectionExpanded && showRootFolderSection;
                                const shouldRenderTags =
                                    item.sectionId === NavigationSectionId.TAGS && tagsSectionExpanded && showRootTagSection;
                                const shouldRenderProperties =
                                    item.sectionId === NavigationSectionId.PROPERTIES &&
                                    propertiesSectionExpanded &&
                                    showRootPropertySection;
                                const shouldRenderTypes =
                                    item.sectionId === NavigationSectionId.TYPES && typesSectionExpanded && showRootTypeSection;

                                return (
                                    <div key={`section:${item.key}`} className="nn-root-reorder-section">
                                        <RootFolderReorderItem {...item.props} trailingAccessory={trailingAccessory} />

                                        {shouldRenderFolders && folderEntries.length > 0 ? (
                                            <SortableList entries={folderEntries} canReorder={canReorderFolders} isMobile={isMobile}>
                                                {showRootFolderReset ? (
                                                    <ResetAction label={RESET_FOLDER_LABEL} onClick={handleResetFolders} />
                                                ) : null}
                                            </SortableList>
                                        ) : null}

                                        {shouldRenderTags && tagEntries.length > 0 ? (
                                            <SortableList entries={tagEntries} canReorder={canReorderTags} isMobile={isMobile}>
                                                {showRootTagReset ? (
                                                    <ResetAction label={resetRootTagOrderLabel} onClick={handleResetTags} />
                                                ) : null}
                                            </SortableList>
                                        ) : null}

                                        {shouldRenderProperties && propertyEntries.length > 0 ? (
                                            <SortableList entries={propertyEntries} canReorder={canReorderProperties} isMobile={isMobile}>
                                                {showRootPropertyReset ? (
                                                    <ResetAction label={resetRootPropertyOrderLabel} onClick={handleResetProperties} />
                                                ) : null}
                                            </SortableList>
                                        ) : null}

                                        {shouldRenderTypes && typeEntriesWithControls.length > 0 ? (
                                            <>
                                                <TypeOrderControl value={typeNavigationSortOrder} onChange={handleTypeSortOrderChange} />
                                                <SortableList
                                                    entries={typeEntriesWithControls}
                                                    canReorder={canReorderTypes}
                                                    isMobile={isMobile}
                                                />
                                            </>
                                        ) : null}
                                    </div>
                                );
                            })
                        ) : (
                            <>
                                {showRootFolderSection && folderEntries.length > 0 ? (
                                    <div className="nn-root-reorder-section">
                                        <SortableList entries={folderEntries} canReorder={canReorderFolders} isMobile={isMobile}>
                                            {showRootFolderReset ? (
                                                <ResetAction label={RESET_FOLDER_LABEL} onClick={handleResetFolders} />
                                            ) : null}
                                        </SortableList>
                                    </div>
                                ) : null}

                                {showRootTagSection && tagEntries.length > 0 ? (
                                    <div className="nn-root-reorder-section">
                                        <SortableList entries={tagEntries} canReorder={canReorderTags} isMobile={isMobile}>
                                            {showRootTagReset ? (
                                                <ResetAction label={resetRootTagOrderLabel} onClick={handleResetTags} />
                                            ) : null}
                                        </SortableList>
                                    </div>
                                ) : null}

                                {showRootPropertySection && propertyEntries.length > 0 ? (
                                    <div className="nn-root-reorder-section">
                                        <SortableList entries={propertyEntries} canReorder={canReorderProperties} isMobile={isMobile}>
                                            {showRootPropertyReset ? (
                                                <ResetAction label={resetRootPropertyOrderLabel} onClick={handleResetProperties} />
                                            ) : null}
                                        </SortableList>
                                    </div>
                                ) : null}

                                {showRootTypeSection && typeEntriesWithControls.length > 0 ? (
                                    <div className="nn-root-reorder-section">
                                        <TypeOrderControl value={typeNavigationSortOrder} onChange={handleTypeSortOrderChange} />
                                        <SortableList entries={typeEntriesWithControls} canReorder={canReorderTypes} isMobile={isMobile} />
                                    </div>
                                ) : null}
                            </>
                        )}
                    </DndContext>
                ) : null}
            </div>
        </div>
    );
}
