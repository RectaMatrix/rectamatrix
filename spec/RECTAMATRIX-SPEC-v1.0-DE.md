# RectaMatrix 2D Barcode Specification

## Version 1.0

Status: Formatkandidat 1 (Vorschau)
Bezeichnung: RectaMatrix
Kurzbezeichnung: RMX
Version: 1.0
Symboltyp: rechteckiger, binärer 2D-Matrixcode
Seitenverhältnis: 3:2
Modulwerte: Schwarz = 1, Weiß = 0

---

# 1. Normative Begriffe

Die Begriffe **MUSS**, **DARF NICHT**, **SOLLTE**, **SOLLTE NICHT** und **KANN** sind normativ zu verstehen.

* **MUSS**: zwingende Anforderung.
* **DARF NICHT**: zwingendes Verbot.
* **SOLLTE**: empfohlene Anforderung; Abweichungen müssen begründet sein.
* **KANN**: optionale Funktion.
* **Modul**: ein einzelnes schwarzes oder weißes Rasterfeld.
* **Symbol**: die vollständige RectaMatrix ohne Quiet Zone.
* **Datenbereich**: alle Module, die nicht für Anchor, Clocking oder Formatheader reserviert sind.
* **Codewort**: ein Byte eines Reed-Solomon-Codeblocks.
* **Payload**: die vom Anwender bereitgestellte Bytefolge vor Kompression.
* **Encoded Payload**: Payload nach optionaler Kompression.
* **Frame**: Encoded Payload einschließlich CRC, jedoch vor Reed-Solomon-Codierung.

---

# 2. Designziele

RectaMatrix Version 1 ist für folgende Einsatzbereiche ausgelegt:

* URLs
* Unicode-Text
* Identifikationsnummern
* Kontaktdaten
* kompakte strukturierte Daten
* beliebige Binärdaten
* Kameradecodierung auf Mobilgeräten
* Druck auf Papier, Etiketten, Verpackungen und Displays

Das Format ist nicht ausschließlich auf lateinische Zeichen beschränkt.

RectaMatrix Version 1 standardisiert zusätzlich die Schnittstelle zwischen Computer-Vision-Erkennung und Symboldecodierung. Decoder KÖNNEN intern unterschiedliche Bildverarbeitungsverfahren verwenden, SOLLTEN jedoch Modulkonfidenzen, Erasures und Qualitätsmetriken gemäß dem RectaMatrix Computer Vision Profile v1 bereitstellen.

RectaMatrix unterstützt insbesondere:

* `ä`, `ö`, `ü`, `ß`
* `à`, `á`, `â`, `æ`, `å`, `ø`
* sämtliche europäischen Schriftsysteme
* Griechisch und Kyrillisch
* Arabisch und Hebräisch
* asiatische Schriftsysteme
* Emoji
* beliebige andere Unicode-Zeichen

Text wird als UTF-8 codiert. Base45 gehört nicht zum internen RectaMatrix-Datenformat.

---

# 3. Koordinatensystem

Das Symbol besitzt eine Breite `W` und eine Höhe `H`.

Die Modulkoordinaten beginnen links oben:

```text
(0,0) --------------------> x
  |
  |
  |
  v
  y
```

Gültige Koordinaten sind:

```text
0 <= x < W
0 <= y < H
```

Das Modul `(0,0)` ist Bestandteil des Micro-Anchors.

---

# 4. Symbolgrößen

RectaMatrix Version 1 unterstützt genau folgende Größen:

| Größen-ID | Breite W | Höhe H | Anchor F |
| --------: | -------: | -----: | -------: |
|         0 |       24 |     16 |        4 |
|         1 |       36 |     24 |        6 |
|         2 |       48 |     32 |        8 |
|         3 |       72 |     48 |       12 |
|         4 |       96 |     64 |       16 |
|         5 |      120 |     80 |       20 |
|         6 |      144 |     96 |       24 |

Alle Größen besitzen exakt das Seitenverhältnis:

```text
W : H = 3 : 2
```

Die frühere Größe `18 × 12` gehört nicht zu Version 1. Bei ihr wäre `F = 3`, wodurch die exakte Halbierung des Anchors nicht ganzzahlig möglich wäre.

Größen-IDs `7` bis `15` sind reserviert.

Ein Decoder für Version 1 MUSS unbekannte Größen-IDs ablehnen.

---

# 5. Quiet Zone

RectaMatrix definiert zwei Quiet-Zone-Profile:

| Profil | Breite Q | Vorgesehener Einsatz |
| --- | ---: | --- |
| Standard | mindestens 4 Module | allgemeiner Druck, Kameraerfassung und unbekannte Hintergründe |
| Compact | exakt 2 Module | kontrollierter Druck, Displays und saubere Hintergründe |

Ein Encoder oder Renderer MUSS das Standardprofil verwenden, sofern der
Aufrufer nicht ausdrücklich Compact auswählt. Eine Quiet Zone von drei Modulen
ist kein definiertes Version-1-Profil und DARF von einem konformen Renderer
NICHT ausgegeben werden.

Empfohlen:

```text
Standard-Quiet-Zone = 4 Module
Compact-Quiet-Zone  = 2 Module
```

Für schwierige Druckbedingungen SOLLTE eine Standard-Quiet-Zone von fünf oder sechs Modulen verwendet werden.

Ein Decoder SOLLTE beide definierten Profile akzeptieren. Compact-Symbole
bieten weniger Abstand zu umgebenden Grafiken und KÖNNEN deshalb einen
saubereren Hintergrund oder ein explizit übergebenes Quellviereck erfordern.

Die Quiet Zone gehört nicht zu `W × H`.

---

# 6. Micro-Anchor

## 6.1 Position

Der Micro-Anchor liegt bei korrekter Orientierung absolut links oben.

Seine Fläche lautet:

```text
0 <= x < F
0 <= y < F
```

mit:

```text
F = H / 4
```

## 6.2 Muster

Der Anchor ist grundsätzlich schwarz. Sein unteres rechtes Viertel ist weiß.

Für ein Anchor-Modul gilt:

```text
anchor(x, y) =
    0, wenn x >= F/2 und y >= F/2
    1, sonst
```

Da alle Größen in Version 1 ein gerades `F` besitzen, sind alle Grenzen ganzzahlig.

Beispiel für `F = 4`:

```text
1111
1111
1100
1100
```

Beispiel für `F = 6`:

```text
111111
111111
111111
111000
111000
111000
```

Der Anchor darf durch keine Maskierung verändert werden.

Der Anchor ist der einzige Finder-Anchor des Formats.

---

# 7. Clocking Pattern

## 7.1 Oberes Clocking Pattern

Auf der obersten Zeile gilt ab `x = F`:

```text
matrix[x, 0] = 1, wenn (x - F) gerade ist
matrix[x, 0] = 0, wenn (x - F) ungerade ist
```

Die Folge beginnt somit mit Schwarz:

```text
1, 0, 1, 0, ...
```

## 7.2 Linkes Clocking Pattern

Auf der linken Spalte gilt ab `y = F`:

```text
matrix[0, y] = 1, wenn (y - F) gerade ist
matrix[0, y] = 0, wenn (y - F) ungerade ist
```

Auch diese Folge beginnt mit Schwarz.

## 7.3 Reservierung

Die gesamte oberste Zeile und die gesamte linke Spalte sind reserviert, soweit sie nicht bereits zum Anchor gehören.

Clocking-Module dürfen nicht maskiert oder als Datenmodule verwendet werden.

---

# 8. Reservierte Module

Ein Modul ist reserviert, wenn mindestens eine der folgenden Bedingungen gilt:

```text
x < F und y < F
```

oder:

```text
y == 0
```

oder:

```text
x == 0
```

Alle übrigen Module sind zunächst zugängliche Module.

Die ersten 96 zugänglichen Module in der definierten Scanreihenfolge werden für den Formatheader verwendet.

Die restlichen zugänglichen Module bilden den Body-Bereich.

---

# 9. Zugängliche Scanreihenfolge

RectaMatrix verwendet eine vertikale Zweispalten-Zickzackreihenfolge.

## 9.1 Grundalgorithmus

Die Scanreihenfolge beginnt rechts unten.

Spalten werden paarweise von rechts nach links verarbeitet:

```text
(W - 1, W - 2)
(W - 3, W - 4)
...
```

Für das erste Spaltenpaar erfolgt der Scan von unten nach oben.

Für das nächste Paar erfolgt der Scan von oben nach unten.

Die Richtung wechselt nach jedem Spaltenpaar.

Innerhalb einer Zeile wird zuerst die rechte, danach die linke Spalte des Paares betrachtet.

Reservierte Module werden übersprungen.

## 9.2 Pseudocode

```js
function buildScanOrder(width, height, isReserved) {
    const cells = [];
    let upward = true;

    for (let right = width - 1; right >= 1; right -= 2) {
        const left = right - 1;

        if (upward) {
            for (let y = height - 1; y >= 0; y--) {
                if (!isReserved(right, y)) cells.push({ x: right, y });
                if (left >= 1 && !isReserved(left, y)) {
                    cells.push({ x: left, y });
                }
            }
        } else {
            for (let y = 0; y < height; y++) {
                if (!isReserved(right, y)) cells.push({ x: right, y });
                if (left >= 1 && !isReserved(left, y)) {
                    cells.push({ x: left, y });
                }
            }
        }

        upward = !upward;
    }

    return cells;
}
```

Spalte `x = 0` wird nicht verarbeitet, da sie vollständig reserviert ist.

## 9.3 Header- und Body-Bereich

Nach Erzeugung der Scanliste `S` gilt:

```text
Header-Zellen = S[0 ... 95]
Body-Zellen   = S[96 ... Ende]
```

Ein Symbol ist ungültig, wenn weniger als 96 zugängliche Module verfügbar sind.

---

# 10. Formatheader

Der Formatheader besteht aus zwölf Bytes:

```text
8 Informationsbytes
4 Reed-Solomon-Paritätsbytes
```

Der Header besitzt somit:

```text
12 × 8 = 96 Bit
```

Der Header wird nicht mit der Body-Maske maskiert. Nach dem RS-Schutz MÜSSEN
seine zwölf Bytes mit den folgenden festen Whitening-Bytes XOR-verknüpft
werden, bevor sie in die Matrix geschrieben werden:

```text
D3 91 6A C5 2E 78 B4 0F 59 E3 86 1D
```

Die Whitening-Bytes enthalten exakt 48 Eins-Bits und 48 Null-Bits. Das
Whitening benötigt keine zusätzlichen Module und verändert den
RS-Fehlerkorrekturabstand nicht. Ein Decoder MUSS die zwölf gelesenen
Headerbytes vor der RS-Decodierung mit derselben Folge XOR-verknüpfen. Da XOR
seine eigene Umkehrfunktion ist, verwenden Encoder und Decoder dieselbe
Operation.

Alle Bytes werden bitweise in Most-Significant-Bit-Reihenfolge geschrieben.

Beispiel für Byte `0xA6`:

```text
1 0 1 0 0 1 1 0
```

---

# 11. Formatheader-Felder

## 11.1 Informationsbytes

| Byte | Inhalt                                 |
| ---: | -------------------------------------- |
|    0 | Sync Byte                              |
|    1 | Version und Größen-ID                  |
|    2 | ECC, Payload-Typ, Kompression, Maske   |
|    3 | RS-Profil und reservierte Bits         |
|    4 | ursprüngliche Payload-Länge, High Byte |
|    5 | ursprüngliche Payload-Länge, Low Byte  |
|    6 | Encoded-Payload-Länge, High Byte       |
|    7 | Encoded-Payload-Länge, Low Byte        |

## 11.2 Sync Byte

Byte 0 MUSS lauten:

```text
0xA7
```

Andere Werte sind für Version 1 ungültig.

## 11.3 Version und Größe

Byte 1:

```text
Bits 7..4: Versionsnummer
Bits 3..0: Größen-ID
```

Für Version 1:

```text
Version = 0001
```

Beispiel für Version 1, Größen-ID 2:

```text
0001 0010 = 0x12
```

## 11.4 Flags

Byte 2:

```text
Bits 7..6: ECC-Level
Bits 5..4: Payload-Typ
Bits 3..2: Kompressionsmodus
Bits 1..0: Masken-ID
```

## 11.5 RS-Profil

Byte 3:

```text
Bits 7..4: RS-Profil
Bits 3..0: reserviert
```

Für Version 1 MUSS das RS-Profil `0001` sein.

Die reservierten Bits müssen null sein.

Somit lautet Byte 3 in Version 1:

```text
0x10
```

## 11.6 Längenfelder

Die Bytes 4 und 5 enthalten die Länge der ursprünglichen Payload in Bytes als unsigned 16-bit Big Endian.

Die Bytes 6 und 7 enthalten die Länge der Encoded Payload nach optionaler Kompression, ebenfalls als unsigned 16-bit Big Endian.

Maximal darstellbare Länge:

```text
65535 Bytes
```

Die real nutzbare Länge ist durch die Symbolkapazität deutlich kleiner.

---

# 12. Payload-Typen

| Bits | Typ        | Bedeutung                       |
| ---- | ---------- | ------------------------------- |
| `00` | Binary     | beliebige Bytes                 |
| `01` | UTF-8      | Unicode-Text                    |
| `10` | reserviert | künftiger kompakter Zahlenmodus |
| `11` | Structured Payload | für künftige strukturierte Profile reserviert |

Version-1-Decoder müssen Binary und UTF-8 unterstützen.

Der Payload-Typ `11` ist für strukturierte Datenprofile reserviert. Version 1.0 definiert dafür noch kein Wire-Format. Ein Version-1.0-Decoder ohne Unterstützung eines separat veröffentlichten Structured-Payload-Profils MUSS diesen Typ mit `UNSUPPORTED_PAYLOAD_TYPE` ablehnen.

Der Payload-Typ `10` bleibt reserviert und MUSS abgelehnt werden.

---

# 13. UTF-8-Regeln

## 13.1 Codierung

JavaScript-Strings werden als UTF-8 codiert.

Eine geeignete Implementierung lautet:

```js
const bytes = new TextEncoder().encode(text);
```

## 13.2 Ungültige Surrogate

Vor der UTF-8-Codierung MUSS geprüft werden, ob der JavaScript-String ungepaarte UTF-16-Surrogate enthält.

Ungepaarte Surrogate müssen abgelehnt werden.

Sie dürfen nicht stillschweigend durch U+FFFD ersetzt werden.

## 13.3 Normalisierung

RectaMatrix führt standardmäßig keine Unicode-Normalisierung aus.

Damit bleiben unterschiedliche, aber visuell ähnliche Sequenzen unterscheidbar.

Beispiel:

```text
U+00E4
```

und:

```text
U+0061 U+0308
```

werden nicht automatisch vereinheitlicht.

Anwendungen KÖNNEN vor dem Encoding NFC-Normalisierung anwenden, müssen dies jedoch außerhalb des RectaMatrix-Codecs tun.

## 13.4 Decodierung

UTF-8 MUSS strikt decodiert werden.

In JavaScript:

```js
const decoder = new TextDecoder("utf-8", { fatal: true });
const text = decoder.decode(bytes);
```

Ungültiges UTF-8 führt zu einem Decodierungsfehler.

---

# 14. Kompressionsmodi

| Bits | Modus             |
| ---- | ----------------- |
| `00` | keine Kompression |
| `01` | RM-LZ1            |
| `10` | reserviert        |
| `11` | reserviert        |

Version-1-Encoder und -Decoder MÜSSEN die Modi `00` und `01` unterstützen.

---

# 15. Adaptive Kompressionswahl

Ein Encoder MUSS zunächst die unkomprimierte Payload erzeugen.

Danach KANN er RM-LZ1 anwenden.

Kompression darf nur verwendet werden, wenn:

```text
compressedLength < originalLength
```

Empfohlen wird die strengere Regel:

```text
compressedLength + 2 <= originalLength
```

Damit wird eine Kompression nur gewählt, wenn mindestens zwei Bytes eingespart werden.

Sehr kurze Payloads sollten normalerweise unkomprimiert bleiben.

---

# 16. RM-LZ1-Kompression

RM-LZ1 ist ein kleiner, vollständig deterministischer LZSS-ähnlicher Bytekompressor.

## 16.1 Fenster

Maximaler Rückwärtsabstand:

```text
4096 Bytes
```

Zulässige Distanz:

```text
1 bis 4096
```

## 16.2 Match-Länge

Zulässige Match-Länge:

```text
3 bis 18 Bytes
```

## 16.3 Token-Gruppen

Der Datenstrom besteht aus Gruppen von maximal acht Tokens.

Jede Gruppe beginnt mit einem Flag-Byte.

Die Flagbits werden von Bit 0 nach Bit 7 interpretiert.

```text
0 = Literal
1 = Match
```

Nicht benötigte Flagbits der letzten Gruppe müssen null sein.

## 16.4 Literal

Ein Literal besteht aus genau einem Byte:

```text
[value]
```

## 16.5 Match

Ein Match besteht aus zwei Bytes.

Es codiert:

```text
distanceMinus1: 12 Bit
lengthMinus3:    4 Bit
```

Layout:

```text
Byte A: distanceMinus1 Bits 11..4
Byte B:
    Bits 7..4: distanceMinus1 Bits 3..0
    Bits 3..0: lengthMinus3
```

Berechnung:

```js
const distanceMinus1 = ((byteA << 4) | (byteB >>> 4));
const distance = distanceMinus1 + 1;
const length = (byteB & 0x0F) + 3;
```

## 16.6 Encoder-Suchstrategie

Der normative Decoder ist unabhängig von der Suchstrategie.

Für reproduzierbare Encoder-Ergebnisse SOLLTE der Encoder:

1. an der aktuellen Position den längsten Match suchen,
2. bei gleicher Länge die kleinste Distanz wählen,
3. Matches erst ab Länge 3 verwenden,
4. maximal 4096 Bytes zurücksuchen,
5. maximal 18 Bytes vergleichen.

Ein Encoder KANN eine schnellere Hash- oder Dictionary-Suche verwenden, sofern der erzeugte Datenstrom gültig bleibt.

## 16.7 Überlappende Matches

Der Decoder MUSS überlappende Rückwärtskopien unterstützen.

Beispiel:

```text
Ausgabe bisher: A
Distanz: 1
Länge: 5
Ergebnis: AAAAAA
```

## 16.8 Gültigkeitsprüfung

Ein RM-LZ1-Stream ist ungültig, wenn:

* die Match-Distanz größer als die bisherige Ausgabelänge ist,
* die Ausgabe die im Header angegebene Originallänge überschreitet,
* der Eingabestrom vor Erreichen der Originallänge endet,
* nach Erreichen der Originallänge zusätzliche Tokenbytes verbleiben.

---

# 17. Integritätsprüfung

Die Integrität der ursprünglichen, dekomprimierten Payload wird mit CRC-32C geprüft.

## 17.1 CRC-Parameter

Name:

```text
CRC-32C / Castagnoli
```

Reflektiertes Polynom:

```text
0x82F63B78
```

Initialwert:

```text
0xFFFFFFFF
```

Final XOR:

```text
0xFFFFFFFF
```

Ein- und Ausgabe sind reflektiert.

## 17.2 CRC-Eingabe

Die CRC wird ausschließlich über die ursprüngliche Payload berechnet.

Bei UTF-8-Text sind dies die UTF-8-Bytes.

## 17.3 Speicherung

Die CRC wird als vier Bytes Big Endian an die Encoded Payload angehängt:

```text
Frame = EncodedPayload || CRC32C(originalPayload)
```

Die Framelänge lautet:

```text
frameLength = encodedPayloadLength + 4
```

---

# 18. ECC-Level

Byte 2, Bits 7 bis 6:

| Bits | Level      | Verhältnis | Mindestparität je Block |
| ---- | ---------- | ---------: | ----------------------: |
| `00` | Low        |        5 % |                 4 Bytes |
| `01` | Medium     |       15 % |                 8 Bytes |
| `10` | High       |       30 % |                12 Bytes |
| `11` | reserviert |          – |                       – |

Die Prozentzahl wird auf die Anzahl der Datenbytes eines einzelnen RS-Blocks angewandt.

Berechnung:

```text
parityBytes = max(
    minimumParity,
    ceil(dataBytes × ratio)
)
```

Beispiele:

Low bei 20 Datenbytes:

```text
max(4, ceil(20 × 0,05)) = 4
```

Medium bei 40 Datenbytes:

```text
max(8, ceil(40 × 0,15)) = 8
```

High bei 40 Datenbytes:

```text
max(12, ceil(40 × 0,30)) = 12
```

---

# 19. Reed-Solomon-Definition

RectaMatrix verwendet Reed-Solomon über:

```text
GF(256)
```

## 19.1 Feld

Primitive Polynomdarstellung:

```text
x^8 + x^4 + x^3 + x^2 + 1
```

Hexadezimal:

```text
0x11D
```

Primitives Element:

```text
α = 2
```

## 19.2 Generatorpolynom

Für `r` Paritätsbytes:

```text
g(x) = ∏(x - α^i), i = 0 bis r-1
```

Die erste Generatorwurzel ist somit:

```text
α^0
```

## 19.3 Byte-Reihenfolge

Das erste Datenbyte ist der Koeffizient des höchsten Grades.

Die Paritätsbytes werden nach den Datenbytes angehängt.

Systematische Form:

```text
dataBytes || parityBytes
```

## 19.4 Korrekturvermögen

Bei `r` Paritätsbytes gilt:

```text
2 × unbekannteFehler + Auslöschungen <= r
```

Ohne Erasures können maximal:

```text
floor(r / 2)
```

fehlerhafte Bytes korrigiert werden.

---

# 20. Header-Fehlerkorrektur

Die acht Header-Informationsbytes werden mit vier RS-Paritätsbytes geschützt.

Headercode:

```text
RS(12, 8)
```

Damit können korrigiert werden:

* bis zu zwei unbekannte Bytefehler oder
* bis zu vier bekannte Byteauslöschungen oder
* entsprechende Kombinationen.

Nach erfolgreicher Headerkorrektur müssen zusätzlich geprüft werden:

* Sync Byte
* Version
* Größen-ID
* reservierte Bits
* Längenplausibilität
* ECC-Level
* Payload-Typ
* Kompressionsmodus
* Masken-ID

---

# 21. Aufteilung des Datenframes in RS-Blöcke

Der Frame besteht aus:

```text
Encoded Payload + 4 CRC-Bytes
```

Seine Länge sei `D`.

## 21.1 Blockzahl

Der Encoder wählt die kleinste positive Blockzahl `B`, bei der jeder Block einschließlich seiner Parität höchstens 255 Bytes besitzt.

Beginn:

```text
B = 1
```

Für jedes `B` wird der Frame möglichst gleichmäßig aufgeteilt.

## 21.2 Blockgrößen

```text
base = floor(D / B)
extra = D mod B
```

Für Block `i`:

```text
dataLength[i] =
    base + 1, wenn i < extra
    base, sonst
```

Die ersten `extra` Blöcke erhalten somit ein zusätzliches Datenbyte.

## 21.3 Paritätslängen

Für jeden Block wird die Paritätslänge separat anhand seines ECC-Levels berechnet.

Ein `B` ist gültig, wenn für alle Blöcke gilt:

```text
dataLength[i] + parityLength[i] <= 255
```

Ist die Bedingung nicht erfüllt, wird `B` erhöht.

## 21.4 Leere Blöcke

Leere Blöcke sind unzulässig.

Es muss gelten:

```text
B <= D
```

Da jeder Frame mindestens vier CRC-Bytes besitzt, ist `D >= 4`.

---

# 22. RS-Blockinterleaving

Nach der RS-Codierung werden die Codewörter räumlich interleaved.

Angenommen, es existieren `B` Blöcke.

Zuerst werden die Datenbytes interleaved:

```text
Block0.Data0
Block1.Data0
...
BlockB-1.Data0
Block0.Data1
Block1.Data1
...
```

Falls ein Block an einer Position kein Datenbyte besitzt, wird er übersprungen.

Danach werden die Paritätsbytes interleaved:

```text
Block0.Parity0
Block1.Parity0
...
BlockB-1.Parity0
Block0.Parity1
...
```

Auch hier werden nicht vorhandene Positionen übersprungen.

Die daraus entstehende Bytefolge heißt:

```text
Interleaved Codeword Stream
```

Der Decoder rekonstruiert daraus anhand der Headerlängen, des ECC-Levels und der deterministischen Blockaufteilung die ursprünglichen Blöcke.

---

# 23. Body-Bitstream

Der Body-Bitstream besteht aus:

1. Interleaved Codeword Stream
2. Terminatorbit
3. Byte-Ausrichtung
4. Paddingbytes

## 23.1 Codewortbits

Jedes Codewort wird MSB-first geschrieben.

## 23.2 Terminator

Nach dem letzten Codewort wird eine einzelne `1` geschrieben.

## 23.3 Byte-Ausrichtung

Danach werden so viele `0`-Bits angehängt, bis die Bitlänge ein Vielfaches von acht ist.

## 23.4 Paddingbytes

Verbleibende vollständige Bytes werden alternierend gefüllt mit:

```text
0xEC
0x11
0xEC
0x11
...
```

## 23.5 Letzte Teilbits

Falls die Body-Kapazität kein Vielfaches von acht ist, werden die letzten unvollständigen Positionen mit den höchstwertigen Bits des nächsten Paddingbytes gefüllt.

Der Decoder benötigt Terminator und Padding nicht zur Rekonstruktion, da die erwartete Codewortanzahl aus dem Header berechnet wird.

---

# 24. Maskierung

Nur der Body-Bereich wird maskiert.

Nicht maskiert werden:

* Anchor
* Clocking Pattern
* Formatheader (er verwendet ausschließlich seine feste Whitening-Folge)

## 24.1 Masken

Masken-ID `0`:

```text
(x + y) mod 2 == 0
```

Masken-ID `1`:

```text
y mod 2 == 0
```

Masken-ID `2`:

```text
x mod 3 == 0
```

Masken-ID `3`:

```text
(x + 2y) mod 3 == 0
```

Ist die jeweilige Bedingung wahr, wird das Bodybit invertiert:

```text
maskedBit = originalBit XOR 1
```

Andernfalls bleibt es unverändert.

---

# 25. Auswahl der besten Maske

Der Encoder MUSS alle vier Masken testen und die Maske mit der niedrigsten Strafpunktzahl wählen.

Bei Gleichstand gewinnt die kleinere Masken-ID.

Die Bewertung wird auf dem vollständigen Symbol einschließlich Anchor und Clocking durchgeführt.

## 25.1 Lange horizontale und vertikale Läufe

Für jeden Lauf gleicher Farbe ab Länge 5:

```text
Strafe = 3 + (Länge - 5)
```

## 25.2 Gleichfarbige 2×2-Blöcke

Für jeden vollständig gleichfarbigen 2×2-Block:

```text
Strafe = 3
```

## 25.3 Anchor-ähnliche Muster

Für jedes Auftreten einer Folge, die dem Verhältnis:

```text
1:1:3:1:1
```

oder einer direkten Invertierung davon entspricht:

```text
Strafe = 20
```

Die Prüfung erfolgt horizontal und vertikal.

## 25.4 Schwarz-Weiß-Verhältnis

Berechne den prozentualen Schwarzanteil.

Für jede angefangene Abweichung von fünf Prozentpunkten gegenüber 50 %:

```text
Strafe = 10
```

Beispiel:

```text
Schwarzanteil 62 %
Abweichung 12 %
ceil(12 / 5) × 10 = 30
```

---

# 26. Kapazitätsberechnung

## 26.1 Zugängliche Module

```text
accessibleModules =
    W × H
    - F × F
    - (W - F)
    - (H - F)
```

Dabei wird der Anchor nur einmal abgezogen.

Vereinfacht:

```text
accessibleModules =
    W × H - F² - W - H + 2F
```

## 26.2 Body-Kapazität

```text
bodyBits = accessibleModules - 96
```

```text
bodyBytesFloor = floor(bodyBits / 8)
```

## 26.3 Größenwahl

Für eine Payload, einen Kompressionsmodus und ein ECC-Level MUSS der Encoder:

1. den Frame bilden,
2. die RS-Blockstruktur bestimmen,
3. die Gesamtzahl der RS-Codewörter berechnen,
4. die benötigten Bits berechnen,
5. die kleinste passende Symbolgröße auswählen.

Benötigte Bits:

```text
requiredBits =
    totalCodewordBytes × 8
    + 1
```

Das zusätzliche Bit ist der Terminator.

Eine Größe passt, wenn:

```text
requiredBits <= bodyBits
```

Passt keine Größe, muss der Encoder einen Kapazitätsfehler melden.

---

# 27. Encoder-Pipeline

Ein konformer Encoder führt folgende Schritte aus:

1. Eingabe validieren.
2. Payload-Typ bestimmen.
3. Bei Text ungepaarte Surrogate ablehnen.
4. Text als UTF-8 codieren.
5. CRC-32C über ursprüngliche Payload berechnen.
6. Optional RM-LZ1 erzeugen.
7. Kleinere zulässige Repräsentation wählen.
8. ECC-Level übernehmen.
9. Für jede Symbolgröße aufsteigend:

   * Headerwerte vorbereiten,
   * Frame bilden,
   * RS-Blöcke bestimmen,
   * RS-Parität erzeugen,
   * Codewörter interleaven,
   * Kapazität prüfen.
10. Kleinste passende Größe wählen.
11. Reservierte Matrixmodule erzeugen.
12. Headerinformationen erzeugen.
13. Header-RS-Parität erzeugen.
14. Feste Header-Whitening-Folge anwenden und das Ergebnis in die ersten 96 Scanzellen schreiben.
15. Body-Bitstream erzeugen.
16. Alle vier Masken testen.
17. Beste Maske wählen.
18. Masken-ID im Header aktualisieren.
19. Header erneut einschließlich Parität erzeugen.
20. Feste Whitening-Folge anwenden und finalen Header schreiben.
21. Final maskierten Body schreiben.
22. Quiet Zone rendern.

Wichtig: Da die Masken-ID Bestandteil des geschützten Headers ist, muss der Header nach der Maskenwahl final neu codiert werden.

---

# 28. Canvas-Rendering

## 28.1 Modulgröße

Die Modulgröße in Pixeln MUSS ganzzahlig sein.

Empfohlen:

```text
moduleSize >= 4 Pixel
```

Für Kameranutzung:

```text
moduleSize >= 6 Pixel
```

## 28.2 Canvas-Größe

Bei Quiet Zone `Q`:

```text
canvasWidth  = (W + 2Q) × moduleSize
canvasHeight = (H + 2Q) × moduleSize
```

## 28.3 Renderingregeln

* Hintergrund vollständig weiß füllen.
* Schwarze Module mit reinem Schwarz rendern.
* Keine Kantenglättung.
* Keine Zwischenräume zwischen Modulen.
* Keine halben Pixelkoordinaten.
* Keine CSS-Skalierung mit Interpolation verwenden.

Beispiel:

```js
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = "#FFFFFF";
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.fillStyle = "#000000";

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (matrix[y][x]) {
            ctx.fillRect(
                (x + quietZone) * moduleSize,
                (y + quietZone) * moduleSize,
                moduleSize,
                moduleSize
            );
        }
    }
}
```

---

# 29. Empfohlene Encoder-API

```js
class RectaMatrixEncoder {
    constructor(options = {}) {}

    encodeText(text, options = {}) {}

    encodeBytes(bytes, options = {}) {}

    buildMatrix(payloadBytes, metadata) {}

    renderToCanvas(canvas, result, renderOptions = {}) {}
}
```

Empfohlene Optionen:

```js
{
    eccLevel: "medium",
    compression: "auto",
    size: "auto",
    quietZone: 4,
    moduleSize: 8
}
```

Empfohlenes Ergebnisobjekt:

```js
{
    version: 1,
    width: 48,
    height: 32,
    sizeId: 2,
    eccLevel: "medium",
    payloadType: "utf8",
    compression: "rm-lz1",
    maskId: 1,
    originalLength: 96,
    encodedLength: 61,
    matrix: boolean[][]
}
```

---

# 30. Decoderübersicht

Der Decoder besteht logisch aus zwei Ebenen:

## 30.1 Computer-Vision-Ebene

Sie rekonstruiert aus einem Bild eine normalisierte Modulmatrix und Konfidenzwerte. Die normative Übergabeschnittstelle zwischen Computer-Vision-Ebene und Symboldecoder ist im RectaMatrix Computer Vision Profile v1 beschrieben.

## 30.2 Symboldecoder

Er verarbeitet:

* Anchor
* Clocking
* Header
* Maskierung
* RS-Codewörter
* CRC
* Dekompression
* UTF-8

Die Symboldecodierung MUSS unabhängig von der konkreten Bilderkennungsimplementierung testbar sein.

Empfohlene Trennung:

```js
class RectaMatrixVisionDetector {}
class RectaMatrixSymbolDecoder {}
class RectaMatrixDecoder {}
```

---

# 31. Bildvorverarbeitung

Eingabe ist ein `ImageData`-Objekt.

## 31.1 Grauwert

Empfohlene Konvertierung:

```text
Y = 0,299R + 0,587G + 0,114B
```

Alpha wird auf Weiß komponiert:

```text
effectiveChannel =
    alpha × channel + (1 - alpha) × 255
```

## 31.2 Skalierung

Sehr große Bilder KÖNNEN für die Konturerkennung verkleinert werden.

Die endgültige Modulsampling-Phase SOLLTE auf dem Originalbild oder einer hochauflösenden Entzerrung erfolgen.

## 31.3 Schwellenwert

Ein Decoder SOLLTE adaptive lokale Binarisierung verwenden.

Empfohlen ist eine lokale Mittelwert- oder Sauvola-Schwelle.

Eine einfache konforme Implementierung KANN:

1. globale Otsu-Schwelle berechnen,
2. anschließend lokale Kontrastkorrektur anwenden.

Die Symboldecodierung darf nicht ausschließlich voraussetzen, dass Schwarz exakt RGB `0,0,0` und Weiß exakt `255,255,255` ist.

---

# 32. Konturerkennung

## 32.1 Komponenten

Auf dem binarisierten Bild werden zusammenhängende dunkle Komponenten gesucht.

8-Nachbarschaft ist empfohlen.

## 32.2 Kandidatenfilter

Ein Kandidat SOLLTE folgende Bedingungen erfüllen:

* ausreichend große Fläche,
* nicht extrem schmal,
* annähernd rechteckige konvexe Hülle,
* vier dominante Ecken,
* Innenbereich mit binärer Modulstruktur.

## 32.3 Quadrilateral

Für jeden Kandidaten wird ein vierseitiges Polygon bestimmt.

Mögliche Verfahren:

* Douglas-Peucker-Approximation,
* Linienanpassung an Konturkanten,
* Hough-Linien und Schnittpunkte,
* Minimum-Area-Rectangle mit anschließender Eckverfeinerung.

Die Ecken SOLLTEN subpixelgenau verfeinert werden.

---

# 33. Seitenverhältnisprüfung

Da ein perspektivisch aufgenommenes Rechteck nicht direkt das Verhältnis 3:2 zeigt, muss zunächst ein projektives Rechteckmodell geschätzt werden.

Für beide möglichen Zuordnungen der langen und kurzen Seite wird eine Homographie berechnet.

Nach Entzerrung muss gelten:

```text
erwartetes Verhältnis = 1,5
```

Empfohlene Toleranz für die Vorauswahl:

```text
1,32 <= Verhältnis <= 1,68
```

Die endgültige Größenentscheidung erfolgt nicht allein anhand des Verhältnisses, sondern über Anchor- und Clocking-Übereinstimmung.

---

# 34. Orientierungsbestimmung

Der Decoder darf die Bildorientierung nicht voraussetzen.

Für jeden Rechteckkandidaten werden vier Eckzuordnungen getestet:

* 0°
* 90°
* 180°
* 270°

Für jede Zuordnung und jede zulässige Symbolgröße werden folgende Scores berechnet:

1. Anchor-Score
2. oberer Clocking-Score
3. linker Clocking-Score
4. Kontrastscore
5. Geometriescore

Die Zuordnung mit dem besten Gesamtscore wird gewählt.

Das 3:2-Verhältnis erleichtert die Unterscheidung von 90° und 270°. Die asymmetrische Anchorposition löst zusätzlich die Unterscheidung zwischen 0° und 180°.

---

# 35. Perspektivische Entzerrung

Für jede Kandidatengröße wird eine Homographie vom Bildquadrilateral auf ein normiertes Rechteck berechnet.

Empfohlene interne Auflösung:

```text
Samples pro Modul = 5 bis 9
```

Beispiel bei `48 × 32` und sieben Samples:

```text
336 × 224 Pixel
```

Das Sampling SOLLTE nicht nur am exakten Modulzentrum erfolgen.

---

# 36. Modulsampling

## 36.1 Stichprobenbereich

Für jedes Modul wird ein innerer Bereich ausgewertet.

Empfohlen:

```text
20 % bis 80 % der Modulbreite
20 % bis 80 % der Modulhöhe
```

Die Ränder werden vermieden, um perspektivische und druckbedingte Übergänge nicht überzubewerten.

## 36.2 Intensität

Als Modulintensität wird der Median oder getrimmte Mittelwert des inneren Bereichs verwendet.

Median ist robuster gegen Glanzpunkte und einzelne Ausreißer.

## 36.3 Lokale Schwarz-Weiß-Referenz

Schwarz- und Weißreferenzen werden aus bekannten Anchor- und Clocking-Modulen geschätzt.

Empfohlen:

```text
blackReference = Median bekannter schwarzer Module
whiteReference = Median bekannter weißer Module
threshold = (blackReference + whiteReference) / 2
```

## 36.4 Bitentscheidung

```text
intensity < threshold => schwarz => 1
intensity >= threshold => weiß => 0
```

Bei invertierten Bildern KANN zusätzlich eine invertierte Hypothese getestet werden.

---

# 37. Modulkonfidenz

Für jedes Modul wird eine Konfidenz zwischen 0 und 1 berechnet.

Beispiel:

```text
confidence =
    abs(intensity - threshold)
    / max(abs(blackReference - whiteReference) / 2, epsilon)
```

Danach auf den Bereich `[0,1]` begrenzen.

Zusätzliche Konfidenzabzüge SOLLTEN erfolgen bei:

* hohem Intensitätsrauschen innerhalb des Moduls,
* starken Gradienten im Modulzentrum,
* Nähe zum Bildrand,
* unsicherer Homographie,
* schlechtem lokalen Kontrast.

---

# 38. Anchor-Score

Für die erwarteten `F × F` Anchor-Module wird die gewichtete Übereinstimmung berechnet.

```text
anchorScore =
    Summe(confidence × correct)
    / Summe(confidence)
```

Dabei ist:

```text
correct = 1 bei Übereinstimmung
correct = 0 bei Abweichung
```

Empfohlene Mindestwerte:

```text
anchorScore >= 0,80
```

Für eine sichere Erkennung:

```text
anchorScore >= 0,90
```

Die weiße Aussparung MUSS separat geprüft werden, damit ein einfacher schwarzer Block nicht als Anchor akzeptiert wird.

---

# 39. Clocking-Score

Die bekannten Clocking-Bits werden mit dem erwarteten Wechselmuster verglichen.

Getrennte Scores:

```text
topClockScore
leftClockScore
```

Empfohlene Mindestwerte:

```text
topClockScore >= 0,75
leftClockScore >= 0,75
```

Empfohlener gemeinsamer Wert:

```text
(topClockScore + leftClockScore) / 2 >= 0,82
```

Mit den Clocking-Übergängen können Modulabstand und Homographie iterativ verfeinert werden.

---

# 40. Größenerkennung

Alle sieben Version-1-Größen werden getestet.

Für jede Größe wird bewertet:

* Anchor passt zu `F`,
* Clocking-Länge passt zu `W` und `H`,
* alternierende Übergänge liegen an den erwarteten Positionen,
* Formatheader ist RS-decodierbar,
* Header-Größen-ID entspricht der getesteten Größe.

Ein Kandidat darf nur akzeptiert werden, wenn die Größen-ID des korrigierten Headers mit der getesteten Geometrie übereinstimmt.

---

# 41. Headerdecodierung

1. Erste 96 zugängliche Module gemäß Scanreihenfolge lesen.
2. Je acht Bits zu einem Byte zusammensetzen.
3. Die zwölf Bytes mit der festen Header-Whitening-Folge XOR-verknüpfen.
4. Bitkonfidenzen zu Bytekonfidenzen aggregieren.
5. Unsichere Bytes als Erasures markieren.
6. RS(12,8) decodieren.
7. Headerfelder validieren.

Empfohlene Byte-Erasure-Regel:

Ein Headerbyte wird als Erasure markiert, wenn:

```text
mindestens zwei Bits confidence < 0,25
```

oder:

```text
mittlere Byteconfidence < 0,35
```

Ein Decoder KANN mehrere Erasure-Schwellen testen.

---

# 42. Bodydecodierung

Nach erfolgreicher Headerdecodierung:

1. Bodymodule lesen.
2. Bodymaske anhand Masken-ID entfernen.
3. Erwartete Blockgrößen berechnen.
4. Erwartete Gesamtzahl Codewortbytes bestimmen.
5. Genau diese Anzahl Bytes aus dem Body lesen.
6. Interleaving rückgängig machen.
7. Unsichere Codewortbytes als Erasures markieren.
8. Jeden RS-Block decodieren.
9. Datenbytes der Blöcke in Originalreihenfolge zusammensetzen.
10. Encoded Payload und CRC trennen.
11. Payload dekomprimieren, falls erforderlich.
12. Originallänge prüfen.
13. CRC-32C prüfen.
14. Payload gemäß Payload-Typ zurückgeben.

Der Terminator und die Paddingbytes müssen nicht interpretiert werden, sobald alle erwarteten Codewörter gelesen wurden.

---

# 43. Body-Bytekonfidenz und Erasures

Für jedes Codewortbyte werden die acht Modulkonfidenzen ausgewertet.

Empfohlene Erasure-Regel:

Ein Byte gilt als Erasure, wenn mindestens eine der Bedingungen erfüllt ist:

```text
mindestens drei Bits confidence < 0,30
```

oder:

```text
mittlere confidence < 0,40
```

oder:

```text
niedrigste confidence < 0,10
```

Der Decoder SOLLTE zuerst mit konservativen Erasures decodieren.

Falls die Decodierung oder CRC-Prüfung fehlschlägt, KANN er weitere Versuche mit variierenden Erasure-Schwellen durchführen.

Die Anzahl der Versuche SOLLTE begrenzt werden.

---

# 44. RS-Decodierung

Ein konformer RS-Decoder SOLLTE mindestens folgende Schritte implementieren:

1. Syndromberechnung
2. Erasure-Locator-Polynom
3. Berlekamp-Massey oder erweiterten euklidischen Algorithmus
4. Chien-Suche
5. Forney-Algorithmus
6. Korrektur der betroffenen Codewörter
7. erneute Syndromprüfung

Ein Block gilt nur dann als erfolgreich korrigiert, wenn nach der Korrektur alle Syndrome null sind.

Die CRC-Prüfung bleibt zusätzlich verpflichtend.

---

# 45. Dekompression und CRC-Prüfung

Bei Kompressionsmodus `00`:

```text
originalPayload = encodedPayload
```

Es muss gelten:

```text
originalLength == encodedLength
```

Bei Kompressionsmodus `01`:

```text
originalPayload = RMLZ1Decode(encodedPayload, originalLength)
```

Danach:

```text
actualCRC = CRC32C(originalPayload)
```

Der Decoder akzeptiert die Payload nur, wenn:

```text
actualCRC == storedCRC
```

Eine erfolgreiche RS-Korrektur ohne erfolgreiche CRC-Prüfung gilt nicht als gültige Decodierung.

---

# 46. UTF-8-Ausgabe

Bei Payload-Typ UTF-8:

1. UTF-8 strikt validieren.
2. In einen JavaScript-String decodieren.
3. Keine Normalisierung durchführen.
4. Sowohl String als auch Originalbytes zurückgeben.

Empfohlenes Ergebnis:

```js
{
    ok: true,
    text: "Grüße aus København – àæå",
    bytes: Uint8Array,
    metadata: {
        version: 1,
        sizeId: 2,
        width: 48,
        height: 32,
        eccLevel: "medium",
        compression: "rm-lz1",
        maskId: 1,
        orientation: 0
    },
    report: {
        profile: "rmx-cv-1",
        overallConfidence: 0.91,
        imageQuality: 0.88,
        anchorScore: 0.96,
        topClockScore: 0.93,
        leftClockScore: 0.92,
        meanModuleConfidence: 0.89,
        correctedCodewords: 3,
        erasuresUsed: 2,
        crcValid: true
    }
}
```

---

# 47. Decoderfehler

Empfohlene Fehlercodes:

```text
NO_SYMBOL_FOUND
INVALID_GEOMETRY
ANCHOR_NOT_FOUND
CLOCKING_MISMATCH
UNSUPPORTED_SIZE
HEADER_RS_FAILURE
INVALID_HEADER
UNSUPPORTED_VERSION
UNSUPPORTED_PAYLOAD_TYPE
UNSUPPORTED_COMPRESSION
BODY_TRUNCATED
BODY_RS_FAILURE
DECOMPRESSION_FAILURE
LENGTH_MISMATCH
CRC_FAILURE
INVALID_UTF8
AMBIGUOUS_SYMBOL
```

Fehler sollten maschinenlesbar zurückgegeben werden.

---

# 48. Empfohlene Decoder-API

```js
class RectaMatrixDecoder {
    constructor(options = {}) {}

    decodeImageData(imageData, options = {}) {}

    detectCandidates(imageData) {}

    sampleCandidate(imageData, candidate, size) {}

    decodeSampledMatrix(sampledMatrix) {}
}
```

Ergebnis bei Erfolg:

```js
{
    ok: true,
    type: "utf8",
    text: "...",
    bytes: Uint8Array,
    metadata: {},
    report: {}
}
```

Das Feld `report` SOLLTE dem in Kapitel 61 definierten Decode Quality Report entsprechen. Ein Decoder ohne Bildquelle, beispielsweise ein reiner Matrixdecoder, KANN nicht verfügbare bildbezogene Felder auslassen oder auf `null` setzen.

Ergebnis bei Fehler:

```js
{
    ok: false,
    error: {
        code: "CRC_FAILURE",
        message: "Payload CRC-32C does not match."
    }
}
```

---

# 49. Konformitätsanforderungen an Encoder

Ein Version-1-Encoder ist konform, wenn er:

* ausschließlich definierte Größen verwendet,
* Anchor und Clocking exakt setzt,
* die definierte Scanreihenfolge verwendet,
* Header als RS(12,8) erzeugt,
* UTF-8 und Binary unterstützt,
* CRC-32C korrekt berechnet,
* keine oder RM-LZ1-Kompression erzeugt,
* Hauptdaten mit dem definierten RS-Verfahren schützt,
* die definierte Interleaving-Reihenfolge verwendet,
* alle vier Masken bewertet,
* die beste Maske deterministisch auswählt,
* die Quiet Zone korrekt rendert.

---

# 50. Konformitätsanforderungen an Decoder

Ein Version-1-Decoder ist konform, wenn er mindestens:

* alle sieben Version-1-Größen erkennt,
* alle vier Orientierungen verarbeiten kann,
* perspektivische Verzerrung kompensiert,
* Header-RS mit Erasures decodiert,
* alle drei definierten ECC-Level unterstützt,
* alle vier Masken entfernt,
* RS-Blöcke und Interleaving rekonstruiert,
* keine Kompression und RM-LZ1 decodiert,
* CRC-32C validiert,
* Binary und UTF-8 ausgibt,
* ungültige oder nicht unterstützte Symbole sauber ablehnt,
* bei Bilddecodierung einen Decode Quality Report gemäß Kapitel 61 bereitstellt oder ausdrücklich dokumentiert, welche optionalen Felder nicht verfügbar sind,
* Modulkonfidenzen und RS-Erasures gemäß dem CV-Profil reproduzierbar verarbeitet.

---

# 51. Sicherheits- und Ressourcenlimits

Decoder verarbeiten potenziell nicht vertrauenswürdige Bilder und Daten.

Eine Implementierung MUSS:

* Längen vor Speicherallokationen prüfen,
* Headerlängen gegen Symbolkapazität prüfen,
* Dekompressionsausgabe strikt auf `originalLength` begrenzen,
* ungültige Match-Distanzen ablehnen,
* RS-Blockanzahl begrenzen,
* Bilddimensionen begrenzen,
* Endlosschleifen bei Kontur- oder RS-Verarbeitung vermeiden,
* die Anzahl alternativer Decodeversuche begrenzen.

Empfohlene Bildobergrenze im Browser:

```text
maximal 25 Millionen Pixel
```

Größere Bilder sollten vorverkleinert oder abgelehnt werden.

---

# 52. Größen- und ECC-Auswahlstrategie

## 52.1 Standard-ECC

Empfohlener Standard:

```text
Medium
```

## 52.2 Low

Low ist geeignet für:

* hochwertige Displays
* kurze Scanentfernung
* kontrollierte Umgebungen
* sehr kleine Symbole

Low sollte nicht für beschädigungsgefährdete Etiketten verwendet werden.

## 52.3 Medium

Medium ist geeignet für:

* allgemeine Smartphone-Scans
* Papierdruck
* Versandetiketten
* Produktverpackungen
* normale Lichtbedingungen

## 52.4 High

High ist geeignet für:

* Außenanwendungen
* industrielle Etiketten
* mögliche Kratzer oder Verschmutzungen
* kleine Druckmodule
* schwierige Kamerawinkel
* langfristige Kennzeichnung

## 52.5 Automatik

Eine automatische Auswahl KANN folgende Vorgaben nutzen:

```text
Display, kontrolliert      => Low
Standarddruck              => Medium
Industrie oder Außenbereich => High
```

Die Anwendung sollte das ECC-Level bewusst speichern oder übertragen, nicht nachträglich erraten.

---

# 53. Warum Reed-Solomon beibehalten wird

RectaMatrix Version 1 verwendet Reed-Solomon nicht deshalb, weil modernere Codes grundsätzlich unbekannt wären, sondern weil das Fehlerprofil eines gedruckten Barcodes häufig aus lokalen, zusammenhängenden Schäden besteht.

Dazu gehören:

* Kratzer
* Flecken
* Faltungen
* Reflexionen
* Teilverdeckung
* ausgefallene Modulbereiche

RS auf Byteebene kombiniert mit:

* räumlichem Interleaving,
* Soft Sampling,
* Erasure-Markierung,
* CRC-32C

ist für diesen Einsatzzweck robust und vergleichsweise einfach implementierbar.

LDPC oder Polar Codes könnten in späteren Versionen als alternatives Profil untersucht werden. Sie sind nicht Bestandteil von Version 1.

---

# 54. Erweiterbarkeit

Unbekannte Versionen müssen abgelehnt werden.

Reserviert sind:

* Größen-IDs 7 bis 15
* Payload-Typen 2 und 3
* Kompressionsmodi 2 und 3
* ECC-Level 3
* RS-Profile 2 bis 15

Eine spätere Version darf die Bedeutung bestehender Version-1-Werte nicht verändern.

Neue Verfahren müssen über Versionsnummer oder Profilfelder eindeutig signalisiert werden.

---

# 55. Empfohlene Implementierungsstruktur

```text
RectaMatrix/
├── constants.js
├── geometry.js
├── scan-order.js
├── utf8.js
├── crc32c.js
├── rmlz1.js
├── gf256.js
├── reed-solomon.js
├── interleaver.js
├── mask.js
├── penalty.js
├── header.js
├── encoder.js
├── canvas-renderer.js
├── image-utils.js
├── threshold.js
├── contours.js
├── homography.js
├── sampler.js
├── detector.js
├── symbol-decoder.js
└── decoder.js
```

Alle Kernmodule sollten ohne externe Abhängigkeiten implementierbar sein.

---

# 56. Verpflichtende Tests

Eine vollständige Implementierung MUSS mindestens folgende Tests enthalten.

## 56.1 Geometrie

* alle sieben Größen
* korrekte Anchor-Muster
* korrekte Clocking-Muster
* reservierte Module
* identische Scanreihenfolge in Encoder und Decoder

## 56.2 Text

* leerer String
* ASCII
* `äöüß`
* `àæå`
* kombinierende Zeichen
* Griechisch
* Kyrillisch
* Arabisch
* CJK
* Emoji
* Ablehnung ungepaarter Surrogate

## 56.3 Kompression

* leere oder kurze Eingaben
* nur Literale
* einfache Wiederholungen
* überlappende Matches
* maximale Distanz
* maximale Match-Länge
* ungültige Distanz
* abgeschnittener Stream
* Ausgabebegrenzung

## 56.4 CRC

* bekannte CRC-32C-Testvektoren
* Einzelbitfehler
* falsche Payload
* falsche Dekompression

## 56.5 Reed-Solomon

* keine Fehler
* maximal korrigierbare Fehler
* maximal korrigierbare Erasures
* gemischte Fehler und Erasures
* zu viele Fehler
* verkürzte Blöcke
* mehrere Blockgrößen

## 56.6 Maskierung

* alle vier Masken
* Involution:

```text
unmask(mask(data)) == data
```

* deterministische Strafpunktwahl
* Gleichstandsregel

## 56.7 Decoderbilder

* 0°, 90°, 180°, 270°
* perspektivische Verzerrung
* Unschärfe
* ungleichmäßige Beleuchtung
* niedriger Kontrast
* teilweise Verschmutzung
* Modulrauschen
* skalierte Bilder
* invertierte Bilder als optionale Erweiterung
* mehrere Rechtecke im Bild
* standardisierte Decode-Report-Felder
* Grenzfälle der Erasure-Schwellen
* deterministische Kandidatenrangfolge bei gleichen Scores

---

# 57. Referenz-Pseudocode für die Größenwahl

```js
function chooseSymbol(payload, options) {
    const original = payload;
    const crc = crc32c(original);

    const candidates = [
        {
            compression: 0,
            encoded: original
        }
    ];

    const compressed = rmlz1Encode(original);

    if (compressed.length + 2 <= original.length) {
        candidates.push({
            compression: 1,
            encoded: compressed
        });
    }

    let best = null;

    for (const candidate of candidates) {
        const frame = concat(
            candidate.encoded,
            uint32ToBytesBE(crc)
        );

        for (const size of RECTAMATRIX_SIZES) {
            const blocks = buildRsBlocks(
                frame,
                options.eccLevel
            );

            const totalCodewords = blocks.reduce(
                (sum, block) =>
                    sum +
                    block.data.length +
                    block.parityLength,
                0
            );

            const requiredBits =
                totalCodewords * 8 + 1;

            const capacity =
                calculateBodyBitCapacity(size);

            if (requiredBits <= capacity) {
                const result = {
                    size,
                    compression: candidate.compression,
                    encoded: candidate.encoded,
                    frame,
                    blocks
                };

                if (
                    best === null ||
                    size.area < best.size.area ||
                    (
                        size.area === best.size.area &&
                        candidate.encoded.length <
                            best.encoded.length
                    )
                ) {
                    best = result;
                }

                break;
            }
        }
    }

    if (!best) {
        throw new RangeError(
            "Payload exceeds RectaMatrix v1 capacity."
        );
    }

    return best;
}
```

---

# 58. Referenz-Pseudocode für die Matrixerzeugung

```js
function createMatrix(config) {
    const { width, height, anchorSize } = config.size;

    const matrix = Array.from(
        { length: height },
        () => Array(width).fill(false)
    );

    const reserved = Array.from(
        { length: height },
        () => Array(width).fill(false)
    );

    writeAnchor(matrix, reserved, anchorSize);
    writeClocking(matrix, reserved, anchorSize);

    const scanOrder = buildScanOrder(
        width,
        height,
        (x, y) => reserved[y][x]
    );

    const headerCells = scanOrder.slice(0, 96);
    const bodyCells = scanOrder.slice(96);

    const interleaved = interleaveBlocks(config.blocks);
    const bodyBits = createBodyBits(
        interleaved,
        bodyCells.length
    );

    let bestCandidate = null;

    for (let maskId = 0; maskId < 4; maskId++) {
        const candidate = cloneMatrix(matrix);

        const header = buildProtectedHeader({
            ...config.header,
            maskId
        });

        writeBits(candidate, headerCells, bytesToBits(applyHeaderWhitening(header)));

        const maskedBody = bodyBits.map((bit, index) => {
            const { x, y } = bodyCells[index];
            return bit ^ Number(maskCondition(maskId, x, y));
        });

        writeBits(candidate, bodyCells, maskedBody);

        const penalty = calculatePenalty(candidate);

        if (
            bestCandidate === null ||
            penalty < bestCandidate.penalty ||
            (
                penalty === bestCandidate.penalty &&
                maskId < bestCandidate.maskId
            )
        ) {
            bestCandidate = {
                matrix: candidate,
                maskId,
                penalty
            };
        }
    }

    return bestCandidate;
}
```

---

# 59. Referenz-Pseudocode für die Symboldecodierung

```js
function decodeSampledSymbol(sampled, size) {
    validateAnchor(sampled, size);
    validateClocking(sampled, size);

    const reserved = createReservedMap(size);
    const scanOrder = buildScanOrder(
        size.width,
        size.height,
        (x, y) => reserved[y][x]
    );

    const headerCells = scanOrder.slice(0, 96);
    const bodyCells = scanOrder.slice(96);

    const headerRead = readBytesWithConfidence(
        sampled,
        headerCells,
        12
    );

    const header = decodeHeaderRS(
        applyHeaderWhitening(headerRead.bytes),
        headerRead.erasures
    );

    validateHeader(header, size);

    const structure = calculateBlockStructure(
        header.encodedLength + 4,
        header.eccLevel
    );

    const codewordCount =
        structure.totalCodewordBytes;

    const bodyRead = readBodyCodewords(
        sampled,
        bodyCells,
        codewordCount,
        header.maskId
    );

    const blocks = deinterleave(
        bodyRead.bytes,
        bodyRead.byteConfidences,
        structure
    );

    const correctedFrame = [];

    for (const block of blocks) {
        const decoded = rsDecode(
            block.codewords,
            block.parityLength,
            block.erasures
        );

        correctedFrame.push(...decoded.data);
    }

    const encodedPayload = correctedFrame.slice(
        0,
        header.encodedLength
    );

    const storedCRC = bytesToUint32BE(
        correctedFrame,
        header.encodedLength
    );

    const originalPayload =
        header.compression === 0
            ? encodedPayload
            : rmlz1Decode(
                encodedPayload,
                header.originalLength
            );

    if (
        originalPayload.length !==
        header.originalLength
    ) {
        throw new DecodeError("LENGTH_MISMATCH");
    }

    if (crc32c(originalPayload) !== storedCRC) {
        throw new DecodeError("CRC_FAILURE");
    }

    return decodePayloadByType(
        originalPayload,
        header.payloadType
    );
}
```

---

# 60. Verbindliche Zusammenfassung

RectaMatrix Version 1 verwendet:

```text
Geometrie:
3:2-Rechteck mit sieben festen Größen

Orientierung:
asymmetrischer Micro-Anchor links oben

Takt:
alternierende obere Zeile und linke Spalte

Text:
striktes UTF-8

Binärdaten:
direkte Bytecodierung

Base-Alphabet:
kein Base45 und keine interne Textbasis

Kompression:
keine oder RM-LZ1, adaptiv gewählt

Integrität:
CRC-32C über die ursprüngliche Payload

Header-Schutz:
RS(12,8) über GF(256)

Payload-ECC:
dynamische, verkürzte RS-Blöcke über GF(256)

ECC-Level:
Low 5 % mit mindestens 4 Paritätsbytes
Medium 15 % mit mindestens 8 Paritätsbytes
High 30 % mit mindestens 12 Paritätsbytes

Burst-Schutz:
Byteinterleaving über mehrere RS-Blöcke

Mapping:
vertikale Zweispalten-Zickzackreihenfolge

Maskierung:
vier definierte Masken mit deterministischer Auswahl

Rendering:
ganzzahlige Module und entweder zwei Module Compact-Quiet-Zone oder mindestens vier Module Standard-Quiet-Zone

Bilddecodierung:
klassische Kontur-, Homographie-, Sampling- und
Schwellwertverfahren

Soft Decoding:
Modulkonfidenzen und RS-Erasures

Computer-Vision-Profil:
standardisierte Übergabe von Matrix, Konfidenzen und Erasures

Qualitätsbericht:
standardisierter Decode Quality Report

Conformance:
Bit-, Matrix- und Bildtestvektoren

Endgültige Validierung:
Originallänge, CRC und gegebenenfalls striktes UTF-8
```

Diese Festlegungen sind ausreichend, um Encoder und Decoder unabhängig voneinander zu implementieren und anhand gemeinsamer Testvektoren auf Bit- und Matrixebene zu prüfen.

# 61. RectaMatrix Decode Quality Report

## 61.1 Zweck

Der Decode Quality Report beschreibt die Qualität und Vertrauenswürdigkeit eines Decodiervorgangs. Er verändert weder das Symbol noch den Bitstream und ist kein Ersatz für RS-, CRC- oder UTF-8-Validierung.

Ein bildbasierter Decoder SOLLTE nach erfolgreicher oder fehlgeschlagener Decodierung einen maschinenlesbaren Bericht erzeugen.

## 61.2 Pflichtfelder für bildbasierte Decoder

Ein Bericht SOLLTE mindestens folgende Felder enthalten:

```text
profile
overallConfidence
imageQuality
anchorScore
topClockScore
leftClockScore
meanModuleConfidence
correctedCodewords
erasuresUsed
crcValid
```

Empfohlenes JSON-Schema auf API-Ebene:

```js
{
    profile: "rmx-cv-1",
    overallConfidence: 0.0,
    imageQuality: 0.0,
    anchorScore: 0.0,
    topClockScore: 0.0,
    leftClockScore: 0.0,
    meanModuleConfidence: 0.0,
    correctedCodewords: 0,
    erasuresUsed: 0,
    crcValid: false
}
```

Alle normalisierten Qualitätswerte liegen im Bereich `[0,1]`.

## 61.3 Optionale Felder

Ein Decoder KANN zusätzlich bereitstellen:

```text
orientationDegrees
perspectiveSkew
blurEstimate
contrastEstimate
damageRatio
headerConfidence
bodyConfidence
rsBlocksCorrected
rsBlocksFailed
decodeAttempts
decodeTimeMs
```

Optionale Felder müssen in der Implementierungsdokumentation beschrieben werden.

## 61.4 Overall Confidence

`overallConfidence` ist eine zusammenfassende Bewertung der Decodierzuverlässigkeit. Sie DARF NICHT allein aus dem CRC-Ergebnis abgeleitet werden.

Eine Referenzimplementierung SOLLTE mindestens berücksichtigen:

* Anchor- und Clocking-Score,
* mittlere Modulkonfidenz,
* geometrische Stabilität,
* Anteil verwendeter Erasures,
* Anteil korrigierter Codewörter,
* CRC-Ergebnis.

Eine erfolgreiche CRC-Prüfung ist für eine gültige Decodierung zwingend, führt aber nicht automatisch zu `overallConfidence = 1`.

## 61.5 Image Quality

`imageQuality` bewertet nur das Eingangssignal und nicht die semantische Gültigkeit der Payload. Berücksichtigt werden SOLLTEN:

* lokaler Kontrast,
* Schärfe,
* Beleuchtungsgleichmäßigkeit,
* geometrische Verzerrung,
* Modulauflösung,
* sichtbare Beschädigung oder Verdeckung.

## 61.6 Fehlerberichte

Bei fehlgeschlagener Decodierung KANN der Bericht teilweise ausgefüllt werden. In diesem Fall MUSS zusätzlich ein Fehlercode gemäß Kapitel 47 zurückgegeben werden.

---

# 62. RectaMatrix Computer Vision Profile v1

## 62.1 Profilkennung

Die Profilkennung lautet:

```text
rmx-cv-1
```

Das Profil standardisiert die Schnittstelle zwischen Bilderkennung und Symboldecoder. Es schreibt keinen einzelnen Bildverarbeitungsalgorithmus vor.

## 62.2 Übergabeobjekt

Die Computer-Vision-Ebene SOLLTE dem Symboldecoder mindestens folgende Informationen übergeben:

```js
{
    width: Number,
    height: Number,
    bits: Uint8Array,
    confidences: Float32Array,
    sourceQuadrilateral: [
        { x: Number, y: Number },
        { x: Number, y: Number },
        { x: Number, y: Number },
        { x: Number, y: Number }
    ],
    orientationDegrees: 0 | 90 | 180 | 270
}
```

`bits` und `confidences` enthalten jeweils genau `width × height` Einträge in zeilenweiser Reihenfolge.

## 62.3 Konfidenzsemantik

Für jedes Modul gilt:

```text
0.0 = vollständig unsicher
1.0 = maximal sicher
```

Konfidenzen beschreiben die Sicherheit der Bitentscheidung, nicht die Wahrscheinlichkeit, dass das Bit schwarz ist.

Ein Wert von `0.9` bedeutet somit, dass die getroffene Schwarz- oder Weißentscheidung mit hoher Sicherheit erfolgt ist.

## 62.4 Bytekonfidenz

Die Bytekonfidenz SOLLTE aus den acht zugehörigen Modulkonfidenzen berechnet werden. Eine Referenzimplementierung verwendet:

```text
byteMean = arithmetisches Mittel der acht Konfidenzen
byteMin  = kleinster Wert der acht Konfidenzen
lowBits  = Anzahl der Bits unter einer Schwelle
```

Die in Kapitel 41 und 43 definierten Regeln bleiben die Referenzregeln für Header- und Body-Erasures.

## 62.5 Erasure-Versuche

Ein Decoder SOLLTE zuerst konservative Erasure-Schwellen verwenden. Falls RS- oder CRC-Prüfung fehlschlägt, KANN er zusätzliche, deterministisch geordnete Schwellenprofile testen.

Empfohlene Reihenfolge:

```text
Profil A: Referenzschwellen aus Kapitel 41 und 43
Profil B: geringfügig strengere Erasures
Profil C: geringfügig großzügigere Erasures
Profil D: keine Erasures
```

Die Anzahl der Versuche MUSS begrenzt sein. Die verwendete Reihenfolge MUSS dokumentiert und für identische Eingaben deterministisch sein.

## 62.6 Referenzpipeline

Die empfohlene, nicht algorithmisch verpflichtende Pipeline lautet:

```text
Eingabebild
→ Grauwert und Alpha-Komposition
→ lokale Kontrastbewertung
→ adaptive Binarisierung
→ Kontur- und Kandidatenerkennung
→ Eckverfeinerung und Homographie
→ Mehrfachsampling pro Modul
→ lokale Schwarz-Weiß-Referenzen
→ Bitentscheidung und Modulkonfidenz
→ Headerdecodierung mit Erasures
→ Bodydecodierung mit Erasures
→ CRC- und Payloadvalidierung
→ Decode Quality Report
```

## 62.7 Determinismus

Bei identischem normalisiertem Übergabeobjekt MUSS ein konformer Symboldecoder dasselbe Decodierergebnis erzeugen.

Bilddetektoren KÖNNEN unterschiedliche Kandidaten oder Konfidenzen erzeugen. Für Conformance-Tests müssen Referenzmatrizen und Referenzkonfidenzen bereitgestellt werden.

---

# 63. Conformance Suite v1

## 63.1 Umfang

Die RectaMatrix Conformance Suite v1 besteht aus drei Ebenen:

```text
A. Bitstream-Testvektoren
B. Matrix-Testvektoren
C. Bild-Testvektoren
```

## 63.2 Bitstream-Testvektoren

Bitstream-Vektoren MÜSSEN mindestens enthalten:

* Eingabepayload,
* Payload-Typ,
* Kompressionsmodus,
* CRC-32C,
* RS-Blockaufteilung,
* Paritätsbytes,
* interleavten Codeword-Stream,
* finalen Header.

## 63.3 Matrix-Testvektoren

Matrix-Vektoren MÜSSEN mindestens enthalten:

* Größe und Größen-ID,
* vollständige unmaskierte Bodybits,
* gewählte Masken-ID,
* finale Symbolmatrix ohne Quiet Zone,
* finale Symbolmatrix mit vier Modulen Standard-Quiet-Zone,
* finale Symbolmatrix mit zwei Modulen Compact-Quiet-Zone.

## 63.4 Bild-Testvektoren

Die offizielle Bildsuite SOLLTE folgende Kategorien enthalten:

```text
clean
print
display
perspective
rotation
blur
motion-blur
shadow
low-contrast
noise
partial-occlusion
reflection
multiple-candidates
```

Jeder Bildvektor SOLLTE Metadaten enthalten:

```text
expectedPayload
expectedType
expectedSizeId
expectedOrientation
expectedResult
allowedErrorCode
minimumOverallConfidence, falls anwendbar
```

## 63.5 Erfolgsdefinition

Ein Bildtest gilt als bestanden, wenn:

* die erwartete Payload bitgenau rekonstruiert wird,
* CRC-32C erfolgreich ist,
* der Payload-Typ korrekt erkannt wird,
* keine nicht erlaubte Ersatzdecodierung ausgegeben wird.

Qualitätswerte dürfen innerhalb dokumentierter Toleranzen variieren.

## 63.6 Negative Testbilder

Die Suite MUSS auch Bilder enthalten, die nicht erfolgreich decodiert werden dürfen, insbesondere:

* zufällige rechteckige Muster,
* beschädigte Symbole jenseits des ECC-Vermögens,
* falsche Header-Größen-ID,
* ungültige CRC,
* nicht unterstützte Version,
* unvollständige Quiet Zone in Kombination mit falschem Anchor.

---

# 64. Versions- und Stabilitätsregeln für v1.0

## 64.1 Eingefrorener Kern

Mit Veröffentlichung von Version 1.0 sind folgende symboltragenden Eigenschaften eingefroren:

* sieben Symbolgrößen und 3:2-Geometrie,
* Micro-Anchor,
* Clocking Pattern,
* Scanreihenfolge,
* Headerlayout,
* CRC-32C,
* RM-LZ1,
* RS-Definition und Interleaving,
* Masken und Strafpunktberechnung,
* Terminator und Padding.

Künftige redaktionelle Änderungen an dieser Spezifikation dürfen diese Eigenschaften nicht verändern.

## 64.2 Profile und Erweiterungen

Neue strukturierte Payloads, alternative CV-Verfahren oder zusätzliche Berichtsmetriken KÖNNEN als separate Profile veröffentlicht werden. Sie dürfen die Bedeutung bestehender Version-1.0-Bitwerte nicht verändern.

## 64.3 Korrekturen

Fehlerkorrekturen an der Dokumentation SOLLTEN als Errata veröffentlicht werden. Falls eine Korrektur das Verhalten konformer Encoder oder Decoder verändert, MUSS sie als neue Core-Version oder ausdrücklich inkompatibles Profil gekennzeichnet werden.

## 64.4 Referenzbezeichnung

Die vollständige Bezeichnung dieser Ausgabe lautet:

```text
RectaMatrix 2D Barcode Specification v1.0
Core Standard with Computer Vision Profile v1
```
