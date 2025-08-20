# Media-Bibliothek

Zentrale Media-Sammlung für alle Kurse der Lernplattform.

## Struktur:
```
public/media/
├── bilder/
│   ├── diagramm1.jpg
│   ├── beispiel.png
│   ├── schema.gif
│   └── ...
└── audio/
    ├── aussprache1.mp3
    ├── beispiel.wav
    ├── sound-effekt.mp3
    └── ...
```

## Verwendung in Single Choice Fragen:

**Für Bilder:**
```
Frage 1 [/media/bilder/diagramm1.jpg]
Richtige Antwort
Falsche Antwort 1
```

**Für Audio:**
```
Frage 2 [/media/audio/aussprache1.mp3]
Richtige Audio-Antwort
Falsche Audio-Antwort
```

## Vorteile:
- ✅ **Wiederverwendbar**: Dateien können in allen Kursen genutzt werden
- ✅ **Zentral organisiert**: Alle Media-Dateien an einem Ort
- ✅ **Einfache Verwaltung**: Keine Duplikate nötig
- ✅ **Konsistente Pfade**: Immer `/media/bilder/` oder `/media/audio/`

## Unterstützte Formate:
- **Bilder**: .jpg, .jpeg, .png, .gif, .webp
- **Audio**: .mp3, .wav, .ogg, .m4a
