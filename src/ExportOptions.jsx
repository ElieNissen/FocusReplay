import React, { useState } from 'react';
import { Button, Label, Slider, Select, ListBox, Switch } from '@heroui/react';
import { Download, X } from 'lucide-react';
export default function ExportOptions({ count, speed, busy, onExport }) {
  const [open, setOpen] = useState(false),
    [fps, setFps] = useState(speed),
    [quality, setQuality] = useState('balanced'),
    [camera, setCamera] = useState(true);
  const presets = {
    compact: { label: 'Compact · 720p', height: 720, crf: 28, mbps: 1 },
    balanced: { label: 'Équilibré · 1080p', height: 1080, crf: 24, mbps: 2.5 },
    high: { label: 'Détaillé · 1080p', height: 1080, crf: 18, mbps: 5 },
  };
  const preset = presets[quality],
    seconds = count / fps,
    mb = Math.max(0.1, (seconds * preset.mbps) / 8);
  return (
    <div className="export-control">
      <Button
        variant="secondary"
        isDisabled={!count || busy}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
      >
        <Download size={17} />
        Exporter en MP4
      </Button>
      {open && (
        <section className="export-options" aria-label="Options d’export">
          <header>
            <strong>Exporter le replay</strong>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Fermer les options d’export"
              onPress={() => setOpen(false)}
            >
              <X size={16} />
            </Button>
          </header>
          <Slider minValue={1} maxValue={8} step={1} value={fps} onChange={setFps}>
            <Label>Lecture · {fps} images/s</Label>
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <Select value={quality} onChange={setQuality}>
            <Label>Qualité</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {Object.entries(presets).map(([key, p]) => (
                  <ListBox.Item id={key} key={key} textValue={p.label}>
                    {p.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Switch isSelected={camera} onChange={setCamera}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Label>Inclure la caméra</Label>
            </Switch.Content>
          </Switch>
          <div className="export-estimate">
            <strong>
              {Math.floor(Math.ceil(seconds) / 60)} min {Math.ceil(seconds) % 60} s
            </strong>
            <span>
              ≈ {(mb * 0.5).toFixed(1)}–{(mb * 1.5).toFixed(1)} Mo
            </span>
          </div>
          <small>
            Poids estimé, variable selon les images. Export local : les masques du partage en ligne
            ne sont pas appliqués.
          </small>
          <Button
            variant="primary"
            isDisabled={busy}
            onPress={() =>
              onExport({ fps, height: preset.height, crf: preset.crf, includeCamera: camera })
            }
          >
            <Download size={16} />
            Exporter
          </Button>
        </section>
      )}
    </div>
  );
}
