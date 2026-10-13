# TPS Notebook Navigator Theming Guide

TPS Notebook Navigator publishes its runtime CSS variables under the `--tps-nn-theme-*` prefix. This isolated namespace lets it remain co-installed with upstream Notebook Navigator without theme-variable or CSS-selector collisions.

Updated: August 1, 2026

## Table of Contents

- [Introduction](#introduction)
- [Theming behavior](#theming-behavior)
  - [Variable scope](#variable-scope)
  - [Pane backgrounds](#pane-backgrounds)
  - [Supporting light and dark modes](#supporting-light-and-dark-modes)
  - [User custom colors](#user-custom-colors)
  - [Style Settings](#style-settings)
- [CSS Variables Reference](#css-variables-reference)
  - [Foreground colors](#foreground-colors)
  - [Navigation pane](#navigation-pane)
    - [Navigation items](#navigation-items)
    - [Navigation selection](#navigation-selection)
    - [File counts](#file-counts)
  - [List pane](#list-pane)
    - [Group headers](#group-headers)
    - [File items](#file-items)
    - [File selection](#file-selection)
    - [Tag and property pills](#tag-and-property-pills)
    - [Quick actions](#quick-actions)
  - [Pane headers and titles](#pane-headers-and-titles)
    - [Pane titles](#pane-titles)
    - [Pane headers](#pane-headers)
    - [Header buttons](#header-buttons)
  - [Calendar](#calendar)
    - [Calendar labels](#calendar-labels)
    - [Day states](#day-states)
    - [Indicators and feature images](#indicators-and-feature-images)
  - [Pane divider](#pane-divider)
  - [Mobile](#mobile)
- [Complete Theme Example](#complete-theme-example)

## Introduction

TPS Notebook Navigator is themed with CSS variables (custom properties). Themes and snippets override these variables to
match the rest of the theme.

The Style Settings plugin exposes most `--tps-nn-theme-*` variables under “TPS Notebook Navigator”.

## Theming behavior

### Variable scope

The theming variables use the `--tps-nn-theme-` prefix. Define overrides under `.theme-light` and `.theme-dark`. Use `body`
when one value should apply to both modes and the variable does not have a mode-specific default.

Most variables are colors and should resolve to a computed color because some are used with `color-mix()`.
`--tps-nn-theme-nav-separator-background` is used as a `background` value.

### Pane backgrounds

On desktop, the background mode setting can map pane backgrounds:

- Separate (default): navigation uses `--tps-nn-theme-nav-bg` and list uses `--tps-nn-theme-list-bg`.
- Primary: navigation uses `--tps-nn-theme-list-bg`.
- Secondary: list uses `--tps-nn-theme-nav-bg`.

On mobile, both panes use `--tps-nn-theme-mobile-bg`.

### Supporting light and dark modes

Define variables under `.theme-light` and `.theme-dark` when modes need different values.

#### Mode-aware example

```css
/* Light mode */
.theme-light {
  /* Navigation pane */
  --tps-nn-theme-nav-bg: #ffeeff;
  --tps-nn-theme-nav-separator-color: #ff99cc;
  --tps-nn-theme-navitem-name-color: #ff66cc;
  --tps-nn-theme-navitem-hover-bg: #ffddff;
  --tps-nn-theme-navitem-selected-bg: #ffccff;
  --tps-nn-theme-navitem-selected-chevron-color: #990099;
  --tps-nn-theme-navitem-selected-icon-color: #990099;
  --tps-nn-theme-navitem-selected-name-color: #990099;
  --tps-nn-theme-navitem-selected-count-color: #ffffff;
  --tps-nn-theme-navitem-selected-count-bg: #ff66cc;

  /* List pane */
  --tps-nn-theme-list-bg: #fff0ff;
  --tps-nn-theme-file-name-color: #cc33ff;
  --tps-nn-theme-file-selected-bg: #ffccff;
  --tps-nn-theme-file-preview-color: #ff99cc;
  --tps-nn-theme-file-tag-custom-color-text-color: #000000;

  /* Calendar */
  --tps-nn-theme-calendar-feature-image-overlay-color: rgb(0 0 0 / 0.05);
}

/* Dark mode */
.theme-dark {
  /* Navigation pane */
  --tps-nn-theme-nav-bg: #330033;
  --tps-nn-theme-nav-separator-color: #ff66ff;
  --tps-nn-theme-navitem-name-color: #ffaaff;
  --tps-nn-theme-navitem-hover-bg: #442244;
  --tps-nn-theme-navitem-selected-bg: #663366;
  --tps-nn-theme-navitem-selected-chevron-color: #ffccff;
  --tps-nn-theme-navitem-selected-icon-color: #ffccff;
  --tps-nn-theme-navitem-selected-name-color: #ffccff;
  --tps-nn-theme-navitem-selected-count-color: #330033;
  --tps-nn-theme-navitem-selected-count-bg: #ffaaff;

  /* List pane */
  --tps-nn-theme-list-bg: #2a002a;
  --tps-nn-theme-file-name-color: #ff99ff;
  --tps-nn-theme-file-selected-bg: #663366;
  --tps-nn-theme-file-preview-color: #cc99cc;
  --tps-nn-theme-file-tag-custom-color-text-color: #ffffff;

  /* Calendar */
  --tps-nn-theme-calendar-feature-image-overlay-color: rgb(0 0 0 / 0.3);
}
```

### User custom colors

Custom colors and backgrounds selected through `Change icon`, `Change color`, or `Change background` take precedence over
theme variables.

### Style Settings

When Style Settings is installed, most theme variables appear under “TPS Notebook Navigator”. The Style Settings panel and
this reference use the same order and element groups. State, border, color, and weight settings remain with the elements
they style.

Not currently exposed in the Style Settings UI:

- `--tps-nn-theme-nav-separator-background`
- `--tps-nn-theme-nav-separator-height`
- `--tps-nn-theme-nav-separator-opacity`

## CSS Variables Reference

### Foreground colors

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-foreground` | `var(--text-normal)` | Base foreground color |
| `--tps-nn-theme-foreground-muted` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 70%, transparent)` | Muted foreground color |
| `--tps-nn-theme-foreground-faded` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 50%, transparent)` | Faded foreground color |
| `--tps-nn-theme-foreground-faint` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 10%, transparent)` | Faint foreground color |

### Navigation pane

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-nav-bg` | `var(--background-secondary)` | Navigation pane background (desktop only, see mobile) |
| `--tps-nn-theme-nav-separator-color` | `var(--tps-nn-theme-foreground)` | Separator line color inside navigation spacers |
| `--tps-nn-theme-nav-separator-background` | `linear-gradient(90deg, transparent 0%, var(--tps-nn-theme-nav-separator-color) 15%, var(--tps-nn-theme-nav-separator-color) 85%, transparent 100%)` | Fill for navigation separators; override to supply a gradient or solid color |
| `--tps-nn-theme-nav-separator-height` | `1px` | Thickness for navigation separators |
| `--tps-nn-theme-nav-separator-opacity` | `0.3` | Opacity for navigation separators |
| `--tps-nn-theme-nav-indent-guide-color` | `var(--tps-nn-theme-foreground-faded)` | Line color for navigation indent guides |
| `--tps-nn-theme-nav-leader-color` | `var(--tps-nn-theme-foreground-faded)` | Color for leaders between item names and trailing values |
| `--tps-nn-theme-pinned-shortcut-shadow-color` | `rgba(0, 0, 0, 0.03)` | Gradient overlay below pinned shortcuts; defaults to `rgba(0, 0, 0, 0.18)` in dark mode |

#### Navigation items

Custom-color weight also applies to list pane group headers, parent folder paths, and tag or property pills. Folder-note
decoration also applies to list pane titles, breadcrumbs, and folder group headers.

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-navitem-chevron-color` | `var(--tps-nn-theme-foreground-muted)` | Item expand/collapse arrow color |
| `--tps-nn-theme-navitem-icon-color` | `var(--tps-nn-theme-foreground-muted)` | Item icon color |
| `--tps-nn-theme-navitem-name-color` | `var(--tps-nn-theme-foreground)` | Item name color |
| `--tps-nn-theme-navitem-file-name-color` | `var(--tps-nn-theme-navitem-name-color)` | File shortcut and recent file name color |
| `--tps-nn-theme-navitem-name-font-weight` | `400` | Item name font weight |
| `--tps-nn-theme-navitem-custom-color-name-font-weight` | `600` | Font weight for custom or rainbow-colored text |
| `--tps-nn-theme-navitem-folder-note-name-decoration` | `underline` | Text decoration for folder note names |
| `--tps-nn-theme-navitem-folder-note-name-hover-decoration` | `underline` | Text decoration when hovering folder note names |
| `--tps-nn-theme-navitem-border-radius` | `4px` | Item corner radius (0-14px) |
| `--tps-nn-theme-navitem-border-width` | `0px` | Item border width for custom backgrounds, hover, and selection |
| `--tps-nn-theme-navitem-custom-border-color` | `transparent` | Item border color with a custom background |
| `--tps-nn-theme-navitem-hover-bg` | `var(--background-modifier-hover)` | Item background when hovered (desktop only) |
| `--tps-nn-theme-navitem-hover-border-color` | `transparent` | Item border color when hovered |
| `--tps-nn-theme-tag-positive-bg` | `#00800033` | Included tag highlight and tag drop target background |
| `--tps-nn-theme-tag-negative-bg` | `#ff000033` | Excluded tag highlight and untagged drop target background |

#### Navigation selection

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-navitem-selected-bg` | `var(--text-selection)` | Selected item background |
| `--tps-nn-theme-navitem-selected-border-color` | `transparent` | Selected item border color |
| `--tps-nn-theme-navitem-selected-chevron-color` | `var(--tps-nn-theme-navitem-chevron-color)` | Selected item expand/collapse arrow color |
| `--tps-nn-theme-navitem-selected-icon-color` | `var(--tps-nn-theme-navitem-icon-color)` | Selected item icon color |
| `--tps-nn-theme-navitem-selected-name-color` | `var(--tps-nn-theme-navitem-name-color)` | Selected item name color |
| `--tps-nn-theme-navitem-selected-inactive-bg` | `var(--background-modifier-hover)` | Selected item background when the pane is inactive |
| `--tps-nn-theme-navitem-selected-inactive-border-color` | `var(--tps-nn-theme-navitem-selected-border-color)` | Selected item border color when the pane is inactive |
| `--tps-nn-theme-navitem-selected-inactive-chevron-color` | `var(--tps-nn-theme-navitem-selected-chevron-color)` | Selected item expand/collapse arrow color when the pane is inactive |
| `--tps-nn-theme-navitem-selected-inactive-icon-color` | `var(--tps-nn-theme-navitem-selected-icon-color)` | Selected item icon color when the pane is inactive |
| `--tps-nn-theme-navitem-selected-inactive-name-color` | `var(--tps-nn-theme-navitem-name-color)` | Selected item name color when the pane is inactive |

#### File counts

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-navitem-count-color` | `var(--tps-nn-theme-foreground-muted)` | File count text color |
| `--tps-nn-theme-navitem-count-font-weight` | `400` | File count font weight |
| `--tps-nn-theme-navitem-count-bg` | `transparent` | File count background |
| `--tps-nn-theme-navitem-count-border-radius` | `8px` | File count corner radius (0-8px) |
| `--tps-nn-theme-navitem-count-border-width` | `0px` | File count border width |
| `--tps-nn-theme-navitem-count-border-color` | `transparent` | File count border color |
| `--tps-nn-theme-navitem-selected-count-color` | `var(--tps-nn-theme-navitem-count-color)` | Selected file count text color |
| `--tps-nn-theme-navitem-selected-count-bg` | `var(--tps-nn-theme-navitem-count-bg)` | Selected file count background |
| `--tps-nn-theme-navitem-selected-count-border-color` | `var(--tps-nn-theme-navitem-count-border-color)` | Selected file count border color |
| `--tps-nn-theme-navitem-selected-inactive-count-color` | `var(--tps-nn-theme-navitem-selected-count-color)` | Selected file count text color when the pane is inactive |
| `--tps-nn-theme-navitem-selected-inactive-count-bg` | `var(--tps-nn-theme-navitem-selected-count-bg)` | Selected file count background when the pane is inactive |
| `--tps-nn-theme-navitem-selected-inactive-count-border-color` | `var(--tps-nn-theme-navitem-selected-count-border-color)` | Selected file count border color when the pane is inactive |

### List pane

Search icon and supporting text use the shared variables under [Pane headers and titles](#pane-headers-and-titles).

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-list-bg` | `var(--background-primary)` | List pane background (desktop only, see mobile) |
| `--tps-nn-theme-list-search-active-bg` | `var(--text-highlight-bg)` | Search field and match highlight background when a query is active |
| `--tps-nn-theme-list-search-border-color` | `var(--background-modifier-border)` | Search field border and focus ring color |
| `--tps-nn-theme-list-separator-color` | `var(--background-modifier-border)` | Separator color between files |

#### Group headers

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-list-group-header-color` | `var(--tps-nn-theme-foreground-muted)` | Group header text color |
| `--tps-nn-theme-list-group-header-font-weight` | `600` | Group header text font weight |

#### File items

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-file-name-color` | `var(--tps-nn-theme-foreground)` | File name color |
| `--tps-nn-theme-file-name-font-weight` | `600` | File name font weight |
| `--tps-nn-theme-file-compact-name-font-weight` | `400` | File name font weight in compact mode |
| `--tps-nn-theme-file-preview-color` | `var(--tps-nn-theme-foreground-muted)` | File preview color |
| `--tps-nn-theme-file-preview-font-weight` | `400` | File preview font weight |
| `--tps-nn-theme-file-task-color` | unset, falls back to location-specific icon or date colors | Task display and unfinished-task replacement file icon color; set values also apply on selected rows |
| `--tps-nn-theme-file-task-font-weight` | `400` | File task count and icon weight |
| `--tps-nn-theme-file-task-complete-color` | unset, falls back to `--tps-nn-theme-file-task-color` | File task color when all tasks are complete; set values also apply on selected rows |
| `--tps-nn-theme-file-task-complete-font-weight` | `400` | File task count and icon weight when all tasks are complete |
| `--tps-nn-theme-file-date-color` | `var(--tps-nn-theme-foreground-faded)` | File date color |
| `--tps-nn-theme-file-date-font-weight` | `400` | File date font weight |
| `--tps-nn-theme-file-word-count-color` | `var(--tps-nn-theme-foreground-faded)` | File word count color |
| `--tps-nn-theme-file-word-count-font-weight` | `400` | File word count font weight |
| `--tps-nn-theme-file-parent-color` | `var(--tps-nn-theme-foreground-faded)` | File parent folder color |
| `--tps-nn-theme-file-parent-font-weight` | `400` | File parent folder font weight |
| `--tps-nn-theme-file-feature-border-radius` | `4px` | Feature image corner radius (0-32px) |
| `--tps-nn-theme-file-border-radius` | `8px` | File item corner radius (0-16px) |

#### File selection

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-file-selected-bg` | `var(--text-selection)` | Selected file background |
| `--tps-nn-theme-file-border-width` | `0px` | Selected file border width |
| `--tps-nn-theme-file-selected-border-color` | `transparent` | Selected file border color |
| `--tps-nn-theme-file-selected-name-color` | `var(--tps-nn-theme-file-name-color)` | Selected file name color |
| `--tps-nn-theme-file-selected-preview-color` | `var(--tps-nn-theme-file-preview-color)` | Selected file preview color |
| `--tps-nn-theme-file-selected-date-color` | `var(--tps-nn-theme-foreground-muted)` | Selected file date color |
| `--tps-nn-theme-file-selected-word-count-color` | `var(--tps-nn-theme-foreground-muted)` | Selected file word count color |
| `--tps-nn-theme-file-selected-parent-color` | `var(--tps-nn-theme-foreground-muted)` | Selected file parent folder color |
| `--tps-nn-theme-file-selected-inactive-bg` | `var(--background-modifier-hover)` | Selected file background when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-border-color` | `var(--tps-nn-theme-file-selected-border-color)` | Selected file border color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-name-color` | `var(--tps-nn-theme-file-selected-name-color)` | Selected file name color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-preview-color` | `var(--tps-nn-theme-file-selected-preview-color)` | Selected file preview color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-date-color` | `var(--tps-nn-theme-file-selected-date-color)` | Selected file date color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-word-count-color` | `var(--tps-nn-theme-file-selected-word-count-color)` | Selected file word count color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-parent-color` | `var(--tps-nn-theme-file-selected-parent-color)` | Selected file parent folder color when the pane is inactive |

#### Tag and property pills

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-file-tag-color` | `var(--tps-nn-theme-foreground-faded)` | Default tag pill text color |
| `--tps-nn-theme-file-tag-custom-color-text-color` | `var(--tps-nn-theme-navitem-name-color)` | Tag pill text color with a custom background but no custom text color |
| `--tps-nn-theme-file-property-color` | `var(--tps-nn-theme-foreground-faded)` | Default property pill text color |
| `--tps-nn-theme-file-tag-font-weight` | `400` | Tag and property pill text font weight without custom text colors |
| `--tps-nn-theme-file-tag-bg` | `transparent` | Default tag pill background |
| `--tps-nn-theme-file-tag-border-radius` | `10px` | Tag pill corner radius (0-10px) |
| `--tps-nn-theme-file-property-bg` | `transparent` | Default property pill background |
| `--tps-nn-theme-file-property-border-radius` | `10px` | Property pill corner radius (0-10px) |
| `--tps-nn-theme-file-pill-border-width` | `1px` | Tag and property pill border width |
| `--tps-nn-theme-file-tag-border-color` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 30%, transparent)` | Tag pill border color without custom colors |
| `--tps-nn-theme-file-property-border-color` | `var(--tps-nn-theme-file-tag-border-color)` | Property pill border color without custom colors |
| `--tps-nn-theme-file-selected-tag-color` | `var(--tps-nn-theme-foreground-muted)` | Selected tag pill text color |
| `--tps-nn-theme-file-selected-tag-bg` | `var(--tps-nn-theme-file-tag-bg)` | Selected tag pill background |
| `--tps-nn-theme-file-selected-tag-border-color` | `var(--tps-nn-theme-file-tag-border-color)` | Selected tag pill border color |
| `--tps-nn-theme-file-selected-property-color` | `var(--tps-nn-theme-foreground-muted)` | Selected property pill text color |
| `--tps-nn-theme-file-selected-property-bg` | `var(--tps-nn-theme-file-property-bg)` | Selected property pill background |
| `--tps-nn-theme-file-selected-property-border-color` | `var(--tps-nn-theme-file-property-border-color)` | Selected property pill border color |
| `--tps-nn-theme-file-selected-inactive-tag-color` | `var(--tps-nn-theme-file-selected-tag-color)` | Selected tag pill text color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-tag-bg` | `var(--tps-nn-theme-file-tag-bg)` | Selected tag pill background when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-property-color` | `var(--tps-nn-theme-file-selected-property-color)` | Selected property pill text color when the pane is inactive |
| `--tps-nn-theme-file-selected-inactive-property-bg` | `var(--tps-nn-theme-file-property-bg)` | Selected property pill background when the pane is inactive |

Tag pills with only a custom text color use the list pane background. Tag pills with a custom background use the
navigation pane background. In `primary` and `secondary` background modes, both panes share the same background.

#### Quick actions

Quick actions are shown on desktop.

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-quick-actions-bg` | `color-mix(in srgb, var(--background-primary) 95%, transparent)` | Quick actions toolbar background |
| `--tps-nn-theme-quick-actions-border` | `var(--background-modifier-border)` | Quick actions toolbar border color |
| `--tps-nn-theme-quick-actions-border-radius` | `4px` | Quick actions toolbar corner radius (0-12px) |
| `--tps-nn-theme-quick-actions-icon-color` | `var(--tps-nn-theme-foreground-muted)` | Quick actions toolbar icon color |
| `--tps-nn-theme-quick-actions-icon-hover-color` | `var(--tps-nn-theme-foreground)` | Quick actions toolbar icon color when hovered |
| `--tps-nn-theme-quick-actions-separator-color` | `var(--background-modifier-border)` | Quick actions toolbar separator color |

### Pane headers and titles

These variables are shared by the navigation and list panes.

#### Pane titles

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-list-heading-color` | `var(--tps-nn-theme-foreground-muted)` | List pane title and navigation pane vault title text color |
| `--tps-nn-theme-list-heading-font-weight` | `600` | List pane title and navigation pane vault title font weight |

#### Pane headers

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-list-header-icon-color` | `var(--tps-nn-theme-foreground-muted)` | Folder, tag, and property icon color in pane headers and search |
| `--tps-nn-theme-list-header-breadcrumb-color` | `var(--tps-nn-theme-foreground-muted)` | Pane header title, breadcrumb, and search supporting text color |
| `--tps-nn-theme-list-header-breadcrumb-font-weight` | `600` | Pane header title and breadcrumb font weight |

#### Header buttons

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-header-button-icon-color` | `var(--icon-color)` | Header button icon color |
| `--tps-nn-theme-header-button-hover-bg` | `var(--background-modifier-hover)` | Header button background when hovered |
| `--tps-nn-theme-header-button-active-bg` | `var(--background-modifier-hover)` | Active header button background |
| `--tps-nn-theme-header-button-active-icon-color` | `var(--text-normal)` | Active header button icon color |
| `--tps-nn-theme-header-button-disabled-icon-color` | `var(--icon-color)` | Disabled header button icon color |

### Calendar

#### Calendar labels

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-calendar-header-color` | `var(--tps-nn-theme-foreground)` | Month, year, and header button text color |
| `--tps-nn-theme-calendar-weekday-color` | `var(--tps-nn-theme-foreground-muted)` | Weekday label text color |
| `--tps-nn-theme-calendar-week-color` | `var(--tps-nn-theme-foreground-muted)` | Week number text color |
| `--tps-nn-theme-calendar-day-in-month-color` | `var(--tps-nn-theme-foreground)` | Current-month day text color |
| `--tps-nn-theme-calendar-day-outside-month-color` | `var(--tps-nn-theme-foreground-faded)` | Outside-month day text color |

#### Day states

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-calendar-weekend-bg` | `color-mix(in srgb, var(--tps-nn-theme-foreground) 10%, transparent)` | Weekend day background |
| `--tps-nn-theme-calendar-hover-bg` | `var(--background-modifier-hover)` | Calendar button and day background when hovered |
| `--tps-nn-theme-calendar-day-today-color` | `var(--tps-nn-theme-calendar-day-in-month-color)` | Today text color |
| `--tps-nn-theme-calendar-day-today-bg` | `var(--text-selection)` | Today highlight background |
| `--tps-nn-theme-calendar-day-active-border-color` | `var(--interactive-accent)` | Selection outline color |
| `--tps-nn-theme-calendar-day-active-border-width` | `3px` | Selection outline thickness |

#### Indicators and feature images

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-calendar-note-indicator-color` | `var(--tps-nn-theme-foreground-faded)` | Daily note indicator color |
| `--tps-nn-theme-calendar-unfinished-task-indicator-color` | `var(--tps-nn-theme-calendar-note-indicator-color)` | Unfinished task indicator color |
| `--tps-nn-theme-calendar-feature-image-text-color` | `white` | Feature image day text color |
| `--tps-nn-theme-calendar-feature-image-overlay-color` | `rgb(0 0 0 / 0.05)` in light mode, `rgb(0 0 0 / 0.3)` in dark mode | Feature image overlay color |

### Pane divider

These variables apply in desktop and tablet dual-pane layouts.

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-divider-border-color` | `var(--divider-color)` | Border color between panes in horizontal and vertical split layouts |
| `--tps-nn-theme-divider-resize-handle-hover-bg` | `var(--interactive-accent)` | Pane divider resize handle background when hovered |

### Mobile

| Variable | Default | Description |
| --- | --- | --- |
| `--tps-nn-theme-mobile-bg` | `var(--mobile-sidebar-background)` | Navigation and list pane background |
| `--tps-nn-theme-mobile-list-header-link-color` | `var(--link-color)` | Header back button and clickable breadcrumb segment color |
| `--tps-nn-theme-mobile-list-header-breadcrumb-color` | `var(--tps-nn-theme-foreground)` | Header breadcrumb current folder and separator color |
| `--tps-nn-theme-mobile-list-header-breadcrumb-font-weight` | `600` | Header breadcrumb font weight |
| `--tps-nn-theme-mobile-toolbar-glass-bg` | `var(--background-primary)` | iOS glass toolbar base color |
| `--tps-nn-theme-mobile-toolbar-button-icon-color` | `var(--link-color)` | Toolbar button icon color |
| `--tps-nn-theme-mobile-toolbar-button-active-bg` | `var(--background-modifier-hover)` | Active toolbar button background |
| `--tps-nn-theme-mobile-toolbar-button-active-icon-color` | `var(--link-color)` | Active toolbar button icon color |

On iOS with floating toolbars enabled, `.tps-notebook-navigator-ios.tps-notebook-navigator-ios-floating-toolbars` overrides:

- `--tps-nn-theme-mobile-toolbar-button-icon-color`: `var(--tps-nn-theme-foreground)`
- `--tps-nn-theme-mobile-toolbar-button-active-bg`: `transparent`

## Complete Theme Example

Example dark-mode theme snippet using a JetBrains Darcula-inspired palette. It sets all `--tps-nn-theme-*` variables
supported by TPS Notebook Navigator:

```css
.theme-dark {
  /* Foreground colors */
  --tps-nn-theme-foreground: #a9b7c6;
  --tps-nn-theme-foreground-muted: #7f8b91;
  --tps-nn-theme-foreground-faded: #6e6e6e;
  --tps-nn-theme-foreground-faint: #4f565a;

  /* Navigation pane */
  --tps-nn-theme-nav-bg: #3c3f41;
  --tps-nn-theme-nav-separator-color: #6e6e6e;
  --tps-nn-theme-nav-separator-background: var(--tps-nn-theme-nav-separator-color);
  --tps-nn-theme-nav-separator-height: 1px;
  --tps-nn-theme-nav-separator-opacity: 0.35;
  --tps-nn-theme-nav-indent-guide-color: rgba(127, 139, 145, 0.65);
  --tps-nn-theme-nav-leader-color: rgba(127, 139, 145, 0.65);
  --tps-nn-theme-pinned-shortcut-shadow-color: rgba(0, 0, 0, 0.2);

  /* Navigation items */
  --tps-nn-theme-navitem-chevron-color: #6e6e6e;
  --tps-nn-theme-navitem-icon-color: #afb1b3;
  --tps-nn-theme-navitem-name-color: #a9b7c6;
  --tps-nn-theme-navitem-file-name-color: #a9b7c6;
  --tps-nn-theme-navitem-name-font-weight: 400;
  --tps-nn-theme-navitem-custom-color-name-font-weight: 600;
  --tps-nn-theme-navitem-folder-note-name-decoration: underline;
  --tps-nn-theme-navitem-folder-note-name-hover-decoration: underline;
  --tps-nn-theme-navitem-border-radius: 3px;
  --tps-nn-theme-navitem-border-width: 1px;
  --tps-nn-theme-navitem-custom-border-color: rgba(0, 0, 0, 0.18);
  --tps-nn-theme-navitem-hover-bg: #4b5059;
  --tps-nn-theme-navitem-hover-border-color: rgba(255, 255, 255, 0.18);
  --tps-nn-theme-tag-positive-bg: rgba(106, 135, 89, 0.2);
  --tps-nn-theme-tag-negative-bg: rgba(219, 80, 80, 0.2);

  /* Navigation selection */
  --tps-nn-theme-navitem-selected-bg: #4a78c8;
  --tps-nn-theme-navitem-selected-border-color: rgba(255, 255, 255, 0.25);
  --tps-nn-theme-navitem-selected-chevron-color: #c5c5c5;
  --tps-nn-theme-navitem-selected-icon-color: #e6e6e6;
  --tps-nn-theme-navitem-selected-name-color: #ffffff;
  --tps-nn-theme-navitem-selected-inactive-bg: #464c55;
  --tps-nn-theme-navitem-selected-inactive-border-color: rgba(255, 255, 255, 0.14);
  --tps-nn-theme-navitem-selected-inactive-chevron-color: #9da2ab;
  --tps-nn-theme-navitem-selected-inactive-icon-color: #b9bec6;
  --tps-nn-theme-navitem-selected-inactive-name-color: #cfd3da;

  /* File counts */
  --tps-nn-theme-navitem-count-color: #7f8b91;
  --tps-nn-theme-navitem-count-font-weight: 400;
  --tps-nn-theme-navitem-count-bg: transparent;
  --tps-nn-theme-navitem-count-border-radius: 3px;
  --tps-nn-theme-navitem-count-border-width: 1px;
  --tps-nn-theme-navitem-count-border-color: rgba(255, 255, 255, 0.2);
  --tps-nn-theme-navitem-selected-count-color: #e6e6e6;
  --tps-nn-theme-navitem-selected-count-bg: rgba(0, 0, 0, 0.2);
  --tps-nn-theme-navitem-selected-count-border-color: rgba(255, 255, 255, 0.3);
  --tps-nn-theme-navitem-selected-inactive-count-color: #b9bec6;
  --tps-nn-theme-navitem-selected-inactive-count-bg: rgba(0, 0, 0, 0.25);
  --tps-nn-theme-navitem-selected-inactive-count-border-color: rgba(255, 255, 255, 0.2);

  /* List pane */
  --tps-nn-theme-list-bg: #2b2b2b;
  --tps-nn-theme-list-search-active-bg: #515336;
  --tps-nn-theme-list-search-border-color: #3c3c3c;
  --tps-nn-theme-list-separator-color: #3c3c3c;

  /* Group headers */
  --tps-nn-theme-list-group-header-color: #7f8b91;
  --tps-nn-theme-list-group-header-font-weight: 600;

  /* File items */
  --tps-nn-theme-file-name-color: #a9b7c6;
  --tps-nn-theme-file-name-font-weight: 600;
  --tps-nn-theme-file-compact-name-font-weight: 400;
  --tps-nn-theme-file-preview-color: #7f8b91;
  --tps-nn-theme-file-preview-font-weight: 400;
  --tps-nn-theme-file-task-color: #afb1b3;
  --tps-nn-theme-file-task-font-weight: 400;
  --tps-nn-theme-file-task-complete-color: #6a8759;
  --tps-nn-theme-file-task-complete-font-weight: 400;
  --tps-nn-theme-file-date-color: #6a8759;
  --tps-nn-theme-file-date-font-weight: 400;
  --tps-nn-theme-file-word-count-color: #6a8759;
  --tps-nn-theme-file-word-count-font-weight: 400;
  --tps-nn-theme-file-parent-color: #cc7832;
  --tps-nn-theme-file-parent-font-weight: 400;
  --tps-nn-theme-file-feature-border-radius: 3px;
  --tps-nn-theme-file-border-radius: 4px;

  /* File selection */
  --tps-nn-theme-file-selected-bg: #4a78c8;
  --tps-nn-theme-file-border-width: 1px;
  --tps-nn-theme-file-selected-border-color: rgba(255, 255, 255, 0.24);
  --tps-nn-theme-file-selected-name-color: #ffffff;
  --tps-nn-theme-file-selected-preview-color: #c5c5c5;
  --tps-nn-theme-file-selected-date-color: #a5dc86;
  --tps-nn-theme-file-selected-word-count-color: #a5dc86;
  --tps-nn-theme-file-selected-parent-color: #ffd580;
  --tps-nn-theme-file-selected-inactive-bg: #383c45;
  --tps-nn-theme-file-selected-inactive-border-color: rgba(255, 255, 255, 0.14);
  --tps-nn-theme-file-selected-inactive-name-color: #dfe3e8;
  --tps-nn-theme-file-selected-inactive-preview-color: #b9bec6;
  --tps-nn-theme-file-selected-inactive-date-color: #8fb275;
  --tps-nn-theme-file-selected-inactive-word-count-color: #8fb275;
  --tps-nn-theme-file-selected-inactive-parent-color: #e3b173;

  /* Tag and property pills */
  --tps-nn-theme-file-tag-color: #9876aa;
  --tps-nn-theme-file-tag-custom-color-text-color: #ffffff;
  --tps-nn-theme-file-property-color: #cc7832;
  --tps-nn-theme-file-tag-font-weight: 400;
  --tps-nn-theme-file-tag-bg: #383a3e;
  --tps-nn-theme-file-tag-border-radius: 3px;
  --tps-nn-theme-file-property-bg: #383a3e;
  --tps-nn-theme-file-property-border-radius: 3px;
  --tps-nn-theme-file-pill-border-width: 1px;
  --tps-nn-theme-file-tag-border-color: rgba(255, 255, 255, 0.2);
  --tps-nn-theme-file-property-border-color: rgba(255, 255, 255, 0.2);
  --tps-nn-theme-file-selected-tag-color: #ffffff;
  --tps-nn-theme-file-selected-tag-bg: #5a5f66;
  --tps-nn-theme-file-selected-tag-border-color: rgba(255, 255, 255, 0.3);
  --tps-nn-theme-file-selected-property-color: #ffffff;
  --tps-nn-theme-file-selected-property-bg: #5a5f66;
  --tps-nn-theme-file-selected-property-border-color: rgba(255, 255, 255, 0.3);
  --tps-nn-theme-file-selected-inactive-tag-color: #dfe3e8;
  --tps-nn-theme-file-selected-inactive-tag-bg: #4c5058;
  --tps-nn-theme-file-selected-inactive-property-color: #dfe3e8;
  --tps-nn-theme-file-selected-inactive-property-bg: #4c5058;

  /* Quick actions */
  --tps-nn-theme-quick-actions-bg: rgba(43, 43, 43, 0.95);
  --tps-nn-theme-quick-actions-border: #555555;
  --tps-nn-theme-quick-actions-border-radius: 4px;
  --tps-nn-theme-quick-actions-icon-color: #7f8b91;
  --tps-nn-theme-quick-actions-icon-hover-color: #a9b7c6;
  --tps-nn-theme-quick-actions-separator-color: #3c3c3c;

  /* Pane titles */
  --tps-nn-theme-list-heading-color: #d0d2d6;
  --tps-nn-theme-list-heading-font-weight: 600;

  /* Pane headers */
  --tps-nn-theme-list-header-icon-color: #7f8b91;
  --tps-nn-theme-list-header-breadcrumb-color: #7f8b91;
  --tps-nn-theme-list-header-breadcrumb-font-weight: 600;

  /* Header buttons */
  --tps-nn-theme-header-button-icon-color: #7f8b91;
  --tps-nn-theme-header-button-hover-bg: #4b5059;
  --tps-nn-theme-header-button-active-bg: #4a78c8;
  --tps-nn-theme-header-button-active-icon-color: #ffffff;
  --tps-nn-theme-header-button-disabled-icon-color: #5c5c5c;

  /* Calendar labels */
  --tps-nn-theme-calendar-header-color: var(--tps-nn-theme-foreground);
  --tps-nn-theme-calendar-weekday-color: var(--tps-nn-theme-foreground-muted);
  --tps-nn-theme-calendar-week-color: var(--tps-nn-theme-foreground-muted);
  --tps-nn-theme-calendar-day-in-month-color: var(--tps-nn-theme-foreground);
  --tps-nn-theme-calendar-day-outside-month-color: var(--tps-nn-theme-foreground-faded);

  /* Calendar day states */
  --tps-nn-theme-calendar-weekend-bg: rgba(169, 183, 198, 0.1);
  --tps-nn-theme-calendar-hover-bg: #4b5059;
  --tps-nn-theme-calendar-day-today-color: #ffffff;
  --tps-nn-theme-calendar-day-today-bg: #4a78c8;
  --tps-nn-theme-calendar-day-active-border-color: rgba(169, 183, 198, 0.5);
  --tps-nn-theme-calendar-day-active-border-width: 2px;

  /* Calendar indicators and feature images */
  --tps-nn-theme-calendar-note-indicator-color: #4a78c8;
  --tps-nn-theme-calendar-unfinished-task-indicator-color: #4a78c8;
  --tps-nn-theme-calendar-feature-image-text-color: #ffffff;
  --tps-nn-theme-calendar-feature-image-overlay-color: rgb(0 0 0 / 0.05);

  /* Pane divider */
  --tps-nn-theme-divider-border-color: #323232;
  --tps-nn-theme-divider-resize-handle-hover-bg: #4a78c8;

  /* Mobile */
  --tps-nn-theme-mobile-bg: #2b2b2b;
  --tps-nn-theme-mobile-list-header-link-color: #589df6;
  --tps-nn-theme-mobile-list-header-breadcrumb-color: #a9b7c6;
  --tps-nn-theme-mobile-list-header-breadcrumb-font-weight: 600;
  --tps-nn-theme-mobile-toolbar-glass-bg: #2b2b2b;
  --tps-nn-theme-mobile-toolbar-button-icon-color: #a9b7c6;
  --tps-nn-theme-mobile-toolbar-button-active-bg: #4a78c8;
  --tps-nn-theme-mobile-toolbar-button-active-icon-color: #ffffff;
}
```
