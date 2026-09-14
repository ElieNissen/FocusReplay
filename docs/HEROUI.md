# HeroUI integration

Use @heroui/react and @heroui/styles 3.2.5 directly for product controls. The root AGENTS.md contains the official documentation index. Regenerate the local, ignored documentation with:

```sh
npx heroui-cli@latest agents-md --react --output AGENTS.md
```

Read the relevant component documentation and its working demo before changes. Check the installed package if the downloaded documentation targets a different release. In 3.2.5, Switch.Content contains Switch.Control and Label, as in the controlled demo; the anatomy snippet currently differs.

- Button: explicit native variant, size, isDisabled and onPress; no variant inference from CSS class names.
- Select: Trigger, Value, Indicator, Popover and ListBox composition.
- Switch: controlled isSelected/onChange and an accessible Label.
- Slider: Track, Fill and Thumb; minValue/maxValue and native onChange.
- ToggleButtonGroup: single selection for Fil/Room, with persistent selected state.

Keep the supplied theme's semantic tokens. Avoid globally overriding component radii, foregrounds, focus states or interaction behavior. Custom layout remains appropriate for the timeline, software tracks, capture preview and compact desktop overlay. Unused starter components under web/components/ui are not the product design system; new product code imports HeroUI directly.

Official agent entry point: https://heroui.com/en/docs/react/getting-started/llms-txt
