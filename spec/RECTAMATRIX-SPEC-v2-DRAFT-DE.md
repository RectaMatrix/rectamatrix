# RectaMatrix v2 – Architekturentwurf

Status: **Arbeitsentwurf, nicht normativ**

Dieser Entwurf beschreibt die geplante grundlegende Überarbeitung von
RectaMatrix. Er ersetzt die v1-Spezifikation erst, wenn Encoder, Decoder,
Detektor, Referenzvektoren und beide Sprachfassungen übereinstimmen.

## 1. Ziele

RectaMatrix v2 soll:

* kurze strukturierte Daten deutlich dichter als eine reine Bytekodierung
  darstellen,
* rechteckige Formate in 3:2, 2:1 und 3:1 unterstützen,
* feinere Größenabstufungen anbieten,
* bei Smartphone-Aufnahmen robust lokalisierbar und projektiv entzerrbar sein,
* eine unabhängig geschützte, kompakte Formatinformation besitzen,
* Binärdaten und vollständiges Unicode ohne Verlust unterstützen,
* Fehlkorrektur und Ende-zu-Ende-Integrität getrennt behandeln,
* Erweiterungen ermöglichen, ohne für jedes neue Feature die Wire-Version zu
  erhöhen.

## 2. Kompatibilitätsentscheidung

Version 1 gilt als Prototyp. Version 2 darf Header, Body-Framing, Geometrien,
Locator und High-Level-Encoding inkompatibel ändern.

Die Implementierung MUSS v2-Symbole erst als stabil ausgeben, wenn normative
Konformitätsvektoren vorliegen. Bis dahin sind erzeugte v2-Symbole experimentell.

## 3. Formatversion

Die Formatversion belegt fest vier Bits.

```text
0000  reserviert
0001  frühere v1-Darstellung
0010  RectaMatrix v2
0011–1110  zukünftige Wire-Versionen
1111  reserviert für ein erweitertes Versionsverfahren
```

Ein variables Zwei-/Vier-Bit-Präfix wird nicht verwendet. Zwei eingesparte Bits
rechtfertigen nicht die zusätzliche Parserkomplexität. Neue Kodierungen,
Integritätsverfahren und Masken werden über eigene Felder erweitert und
verbrauchen deshalb keine neue Wire-Version.

## 4. Geometriefamilien

Die v2-Kernfamilie verwendet folgende Höhen:

```text
16, 20, 24, 28, 32, 40, 48, 64, 80, 96 Module
```

Für jede Höhe werden drei Seitenverhältnisse vorgesehen:

| Familie | Größen (Breite × Höhe) |
| --- | --- |
| 3:2 | 24×16, 30×20, 36×24, 42×28, 48×32, 60×40, 72×48, 96×64, 120×80, 144×96 |
| 2:1 | 32×16, 40×20, 48×24, 56×28, 64×32, 80×40, 96×48, 128×64, 160×80, 192×96 |
| 3:1 | 48×16, 60×20, 72×24, 84×28, 96×32, 120×40, 144×48, 192×64, 240×80, 288×96 |

Breite und Höhe werden aus Locator und Clocking-Struktur bestimmt. Sie werden
nicht erneut als Size-ID im Formatheader gespeichert.

Die größere Zahl möglicher Geometrien darf nicht zu einer linearen Prüfung aller
30 Größen führen. Der Detektor MUSS zuerst Seitenverhältnis und Clocking-Periode
schätzen und anschließend nur eine begrenzte Zahl benachbarter Raster prüfen.

## 5. Locator- und Ausrichtungsziele

Der mit der Symbolgröße quadratisch wachsende v1-Anker wird ersetzt.

Der endgültige v2-Locator MUSS:

* Orientierung eindeutig anzeigen,
* alle vier projektiven Außenkanten bestimmbar machen,
* bei 3:1-Symbolen stabil bleiben,
* seinen Flächenanteil bei großen Symbolen begrenzen,
* eine schnelle ROI-Suche ermöglichen,
* Verwechslungen mit QR-, Data-Matrix- und Aztec-Locatoren vermeiden.

Geplanter Aufbau:

* ein asymmetrischer Hauptanker oben links,
* Clocking-Strukturen an mindestens zwei orthogonalen Kanten,
* kleine Ausrichtungsmarken in entfernten Ecken für die Homographie,
* räumlich verteilte Formatheader-Module.

Die exakten Locatorzellen werden erst nach einem Detektor-Bake-off mit den
Kamerafixtures normativ festgelegt. Dichteberechnungen MÜSSEN bis dahin den
jeweils getesteten Locator explizit nennen.

## 6. Formatheader

Der v2-Header belegt 64 Module beziehungsweise acht Bytes:

```text
4 Informationsbytes
4 Reed-Solomon-Paritätsbytes über GF(256)
```

Der RS-Code über den Header kann bis zu zwei unbekannt fehlerhafte Bytes, vier
bekannte Byte-Auslöschungen oder Mischformen mit
`2 × Fehler + Auslöschungen <= 4` korrigieren.

### 6.1 Informationswort

Das 32-Bit-Informationswort ist wie folgt belegt:

| Bits | Anzahl | Feld |
| --- | ---: | --- |
| 31..28 | 4 | Magic `1010` |
| 27..24 | 4 | Formatversion |
| 23..22 | 2 | Body-ECC-Profil |
| 21 | 1 | Payload-Semantik |
| 20..18 | 3 | Codec-ID |
| 17..15 | 3 | Masken-ID |
| 14..3 | 12 | Encoded Data Length |
| 2..1 | 2 | Integritätsprofil |
| 0 | 1 | reserviert, MUSS null sein |

Der geschützte Header wird vor der Platzierung mit einer festen, ausgeglichenen
64-Bit-Whitening-Folge XOR-verknüpft. Die Whitening-Folge benötigt keine
zusätzlichen Module.

### 6.2 Längenfeld

Werte `0` bis `4094` geben die Länge des encodierten Datenstroms in Bytes an.
Der Wert `4095` ist ein Escape-Wert für ein zukünftiges Extended-Framing und
darf von v2-Core-Encodern nicht erzeugt werden.

Alle v2-Core-Geometrien sind so begrenzt, dass zwölf Längenbits ausreichen.
Eine zukünftige größere Wire-Version kann `4095` verwenden, um ein durch ein
festes Body-RS-Layout geschütztes erweitertes Längenpräfix anzukündigen.

### 6.3 Nicht mehr im Header gespeicherte Felder

* Die Geometrie wird aus dem Raster abgeleitet.
* Das Header-RS-Profil wird durch die Formatversion festgelegt.
* Die ursprüngliche Länge wird nur von Codecs gespeichert, die sie benötigen.
* High-Level-Moduswechsel befinden sich selbstbeschreibend im Datenstrom.

## 7. Headerplatzierung

Die 64 Headermodule dürfen nicht als ein einziger kompakter Block platziert
werden. Eine von Breite und Höhe abgeleitete Permutation verteilt die Bytes über
mehrere voneinander entfernte Regionen. Die acht Bits eines GF(256)-Codeworts
bleiben räumlich beieinander, während die acht Headercodewörter voneinander
getrennt werden. Ein lokaler Defekt soll dadurch möglichst wenige RS-Symbole
beschädigen.

Damit soll ein lokaler Fleck, Reflex oder eine beschädigte Kante nicht mehrere
aufeinanderfolgende Headercodewörter zerstören.

Die exakte Permutation ist vor der Implementierung normativ festzulegen.

## 8. Payload-Semantik

```text
0  Binärdaten; der Decoder liefert Bytes
1  Unicode-Text; der Decoder liefert nach strikter Validierung Text
```

Unicode-Text wird semantisch als Folge von Unicode-Skalarwerten behandelt. Der
Byte-Fallback verwendet UTF-8. Ungültiges UTF-8 darf bei Textsemantik nicht als
erfolgreiches Ergebnis zurückgegeben werden.

## 9. Codec-IDs

```text
000  Raw Byte Stream
001  RectaMatrix High-Level Encoding 1 (RM-HLE1)
010  RM-LZ1 über Raw Bytes
011  reserviert für eine zukünftige allgemeine Kompression
100–111  reserviert
```

`auto` ist nur eine Encoderoption und niemals ein Wire-Wert. Ein Auto-Encoder
erzeugt alle zulässigen Kandidaten und wählt einschließlich Header-, Segment-
und Paddingkosten den kürzesten.

Ein komprimierender Codec MUSS seine erwartete Ausgabelänge als begrenztes
variables Präfix im RS-geschützten Datenstrom speichern. Decoder MÜSSEN vor der
Allokation eine implementierungs- und geometrieabhängige Obergrenze prüfen.

## 10. RM-HLE1

RM-HLE1 ist ein bitgepackter, verlustfreier High-Level-Datenstrom. Er unterstützt
mindestens:

* Numeric: drei Ziffern in zehn Bit, Restgruppen in vier oder sieben Bit,
* Alphanumeric: Paare aus einer festgelegten 45-Zeichen-Tabelle in elf Bit,
* Lower Text: häufige Kleinbuchstaben und Satzzeichen über kompakte Tabellen,
* Upper Text: häufige Großbuchstaben und Satzzeichen über kompakte Tabellen,
* URL Tokens: eine kleine normative Tabelle häufiger, sprachneutraler Präfixe
  und Trennzeichen,
* Byte Shift: beliebige Bytefolgen,
* UTF-8 Fallback: vollständiges Unicode ohne Verlust,
* End of Data.

Der normative Tabelleninhalt und die exakten Latch-, Shift-, Längen- und
Terminierungscodes werden in einem eigenen RM-HLE1-Kapitel festgelegt.

Der Referenzencoder MUSS dynamische Programmierung oder ein äquivalentes
Verfahren verwenden. Er darf keinen Moduswechsel wählen, der den vollständigen
Datenstrom vergrößert. Raw Byte Stream bleibt der universelle Fallback.

Eine URL-Tabelle darf keine veränderliche Webstatistik oder sprachabhängige
Wortliste enthalten. Zulässig sind nur langfristig stabile Syntaxelemente wie
Schema-Präfixe, `www.`, häufige ASCII-Trennzeichen und ausgewählte TLD-Marker.

## 11. Body-ECC

Das Body-ECC-Feld besitzt vier Profile. Die endgültigen Quoten und
Mindestparitäten werden nach Kameratests normativ festgelegt.

Vorläufige Zielwerte:

```text
00  Dense       ungefähr 7 %
01  Balanced    ungefähr 15 %
10  Robust      ungefähr 25 %
11  Maximum     ungefähr 35 %
```

Reed-Solomon-Blöcke werden bei langen Symbolen interleaved. Die Interleaving-
Permutation MUSS räumliche Burstfehler insbesondere bei 2:1- und 3:1-Symbolen
über mehrere RS-Blöcke verteilen.

## 12. Integritätsprofile

Reed-Solomon korrigiert lokale Übertragungsfehler. Eine Integritätsprüfung
bestätigt unabhängig das vollständig rekonstruierte semantische Ergebnis.

```text
00  CRC-32C (Standard für Kamera und allgemeine Nutzung)
01  CRC-24 (optionales Dense-Profil)
10  CRC-16 (nur kontrollierte Anwendungen)
11  reserviert
```

Decoder für allgemeine Kameraanwendungen SOLLTEN standardmäßig nur CRC-32C und
CRC-24 akzeptieren. CRC-16 muss explizit freigeschaltet werden.

Die Prüfsumme bindet eine normative Domänentrennung, die Payload-Semantik, die
rekonstruierte Originallänge und die ursprünglichen Payloadbytes ein. Damit
werden nicht nur die Bytes, sondern auch ihre Interpretation geprüft.

## 13. Maskierung

Drei Headerbits erlauben bis zu acht Masken. v2 definiert acht
Body-Maskenfunktionen und eine deterministische Strafbewertung. Locator,
Clocking, Ausrichtungsmarken und Header werden nicht mit der Body-Maske
verändert.

Der Encoder bewertet alle acht Masken. Der Decoder wendet ausschließlich die im
geschützten Header angegebene Maske an.

## 14. Ruhezonenprofile

```text
Camera    2 Module, empfohlen
Dense     1 Modul, nur für kontrollierten Hintergrund und Druck
Extended  4 Module, für schwierige Umgebungen
```

Die Ruhezone verändert nicht die interne Payloadkapazität. Sie verändert nur
die physische Gesamtfläche und die Zuverlässigkeit der Segmentierung.

## 15. Offene normative Entscheidungen

Vor einer Implementierung als stabile v2 müssen festgelegt werden:

1. exakte Locator- und Ausrichtungszellen,
2. räumliche Headerpermutation und 64-Bit-Whitening-Folge,
3. RM-HLE1-Tabellen und präfixfreie Steuercodes,
4. genaue ECC-Quoten und Mindestparitäten,
5. acht Maskenfunktionen und Strafbewertung,
6. CRC-24-Polynom und alle Prüfsummen-Testvektoren,
7. Body-Framing, Padding und Interleaving für jede Geometrie,
8. maximale dekomprimierte Länge je Geometrie und Codec.

## 16. Implementierungsreihenfolge

1. Geometrietabelle und Kapazitätsrechner ohne Detektoränderung.
2. 64-Bit-Header mit bestehenden Bodybytes und CRC-32C.
3. RM-HLE1 einschließlich optimaler Moduswahl.
4. Encoder und Matrixdecoder mit Konformitätsvektoren.
5. neuer Locator und räumliche Headerplatzierung.
6. 2:1- und 3:1-Detektion sowie projektive Optimierung.
7. CRC-24/CRC-16 und Dense-Ruhezone erst nach Negativtests.
