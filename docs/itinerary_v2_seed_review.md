# Itinerary v2: City Seed Review & DB POI Alignment

## 1. Executive Summary
In compliance with Amendment A2, all attraction seeds for Paladio Itinerary v2 were vetted directly against real OpenStreetMap-derived POIs in the PostgreSQL database (`attractions` table). 

Every seed entry matches an existing attraction row (`tier_source="seed"`, `tier_confidence="high"`). All unseeded attractions default to heuristic tiering (`tier_source="heuristic"`, `tier_confidence="low"`).

## 2. City POI Totals and Seed Coverage

| City | Real DB POIs | Tier 1 Seeds | Tier 2 Seeds | Total Curated | Seed Coverage (%) |
|---|---|---|---|---|---|
| **Paris** | 151 | 6 | 9 | 15 | 9.93% |
| **Madrid** | 103 | 6 | 7 | 13 | 12.62% |
| **Lisbon** | 109 | 6 | 6 | 12 | 11.01% |
| **Porto** | 92 | 6 | 5 | 11 | 11.96% |
| **Tokyo** | 115 | 6 | 7 | 13 | 11.30% |
| **Total** | **570** | **30** | **34** | **64** | **11.23%** |

*Note: 27 legacy test demo rows with `reviews: 1000` (e.g. lowercase `paris`, `madrid`, etc.) are excluded.*

## 3. Seed Breakdown by City

### Paris (`backend/app/data/city_seeds/paris.yaml`)
- **Tier 1 (Iconic)**:
  - `Catacombes de Paris` (0.95, `history_heritage`, full)
  - `Pont Alexandre III` (0.90, `architecture`, quick)
  - `Conciergerie` (0.92, `history_heritage`, full)
  - `Maison de Victor Hugo` (0.85, `art_culture`, full)
  - `Bibliothèque-Musée de l'Opéra` (0.88, `art_culture`, full)
  - `Musée de la Musique` (0.85, `art_culture`, full)
- **Tier 2 (Anchors)**:
  - `Musée de l'Armée`, `Musée des Arts Décoratifs`, `Musée des Arts et Métiers`, `Champs Élysées`, `Cité de l'architecture et du patrimoine`, `Musée Grévin`, `Espace Dali`, `Musée de l'Homme`, `Belvédère de la Sibylle`.

### Madrid (`backend/app/data/city_seeds/madrid.yaml`)
- **Tier 1 (Iconic)**:
  - `Museo Arqueológico Nacional` (0.95, `history_heritage`, full)
  - `Mirador del Templo de Debod` (0.94, `scenic_views`, quick)
  - `Casa de Cervantes` (0.90, `history_heritage`, full)
  - `Andén Cero - Estación de Chamberí` (0.88, `history_heritage`, full)
  - `Museo Casa de la Moneda` (0.86, `history_heritage`, full)
  - `Casa Museo del Ratón Pérez` (0.85, `art_culture`, quick)
- **Tier 2 (Anchors)**:
  - `Museo Sorolla`, `Espacio Fundación Telefónica`, `Museo de Arte Contemporáneo`, `Museo Taurino`, `Monumento a Cristóbal Colón`, `Monumento a Goya`, `Jardines del Descubrimiento`.

### Lisbon (`backend/app/data/city_seeds/lisbon.yaml`)
- **Tier 1 (Iconic)**:
  - `Miradouro do Castelo de São Jorge` (0.96, `scenic_views`, quick)
  - `Aqueduto das Águas Livres` (0.92, `architecture`, full)
  - `Casa Fernando Pessoa` (0.88, `art_culture`, full)
  - `Museu do Aljube - Resistência e Liberdade` (0.87, `history_heritage`, full)
  - `Lisboa Story Center` (0.86, `history_heritage`, full)
  - `Museu Geológico` (0.85, `art_culture`, full)
- **Tier 2 (Anchors)**:
  - `Museu Arqueológico do Carmo`, `Museu Nacional de Arte Contemporânea (MNAC)`, `Centro Interpretativo da História do Bacalhau`, `Museu da Marioneta`, `Museu da Farmácia Lisboa`, `Ah Amália Living Experience`.

### Porto (`backend/app/data/city_seeds/porto.yaml`)
- **Tier 1 (Iconic)**:
  - `Museu de Arte Contemporânea de Serralves` (0.95, `art_culture`, full)
  - `Miradouro Ponte Luiz I` (0.94, `scenic_views`, quick)
  - `Museu Futebol Clube do Porto` (0.90, `history_heritage`, full)
  - `Barcos Rabelo` (0.89, `scenic_views`, quick)
  - `Centro Português de Fotografia` (0.88, `art_culture`, full)
  - `Casa do Cinema Manoel de Oliveira` (0.85, `art_culture`, full)
- **Tier 2 (Anchors)**:
  - `Galeria da Biodiversidade`, `Museu das Marionetas do Porto`, `Antigo Local do Castelo de Gaia`, `Museu da Farmácia`, `Miradouro do Prado do Repouso`.

### Tokyo (`backend/app/data/city_seeds/tokyo.yaml`)
- **Tier 1 (Iconic)**:
  - `Watch Shibuya Crossing` (0.98, `scenic_views`, quick)
  - `Meiji Jingū Forest` (0.95, `nature_outdoors`, full)
  - `刀剣博物館` [Japanese Sword Museum] (0.92, `history_heritage`, full)
  - `太田記念美術館` [Ota Memorial Museum of Art] (0.90, `art_culture`, full)
  - `MIYASHITA PARK North` (0.88, `shopping`, quick)
  - `Carrot Tower 26F` (0.86, `scenic_views`, quick)
- **Tier 2 (Anchors)**:
  - `Samurai Museum Tokyo Ticket Centre`, `日本民藝館` [Japan Folk Crafts Museum], `SOMPO美術館` [Sompo Museum of Art], `Parco Museum Tokyo`, `MIYASHITA PARK South`, `古賀政男音楽博物館`, `Karasuyama Teramachi (temple town)`.

## 4. Canonical Taxonomy Mapping (8 Radar Categories)
All seeds and heuristic fallbacks map strictly to the 8 canonical categories:
- `0`: `art_culture`
- `1`: `history_heritage`
- `2`: `nature_outdoors`
- `3`: `architecture`
- `4`: `food_culinary`
- `5`: `nightlife`
- `6`: `shopping`
- `7`: `scenic_views`
