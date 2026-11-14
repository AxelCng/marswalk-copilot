-- =====================================================================
-- MODELO ESTRELLA - Mapa geologico Jezero / Nili Planum (USGS SIM 3464)
-- Origen: Nili.gdb (ArcGIS File Geodatabase, CRS MTM_clon77.5E, Marte)
-- Grano del hecho: UN ELEMENTO CARTOGRAFICO (poligono, linea o punto)
-- Compatible con SQLite / PostgreSQL (PostGIS: cambiar geom_wkt por geometry)
-- =====================================================================

-- ---------- DIMENSIONES ----------

CREATE TABLE dim_map (                      -- Dimension degenerada de contexto (1 fila hoy)
    map_key          INTEGER PRIMARY KEY,
    series           TEXT NOT NULL,         -- 'SIM 3464'
    title            TEXT NOT NULL,         -- Geologic map of Jezero crater and the Nili Planum region, Mars
    authors          TEXT,                  -- Vivian Z. Sun; Kathryn M. Stack
    pub_year         INTEGER,               -- 2020
    publisher        TEXT,                  -- US Geological Survey
    map_scale        INTEGER,               -- 75000 (1:75,000)
    crs_name         TEXT,                  -- MTM_clon77.5E
    datum            TEXT,                  -- Mars2000 Sphere
    lon_min REAL, lon_max REAL, lat_min REAL, lat_max REAL   -- 76.8-77.8E, 17.7-18.7N
);

CREATE TABLE dim_geologic_unit (            -- Origen: GeoUnits_v1 (1 304 poligonos)
    unit_key         INTEGER PRIMARY KEY,   -- surrogate; 0 = 'No aplica' (rasgos que no son unidad)
    unit_code        INTEGER,               -- campo 'unit' (0-13)
    unit_name        TEXT NOT NULL,         -- campo 'name' (corregido: 'Crater riim' -> 'Crater rim')
    unit_symbol      TEXT NOT NULL,         -- 'symbol'  (p.ej. NHjf2)
    symbol_base      TEXT,                  -- 'symbol_noSub' (NHjf)
    subscript        TEXT,                  -- '1','2' o NULL
    color_id         INTEGER,               -- Color_ID de simbologia
    age_prefix       TEXT,                  -- DERIVADO del simbolo: N=Noachiano, H=Hesperiano, NH=Noachiano-Hesperiano, NULL=no indicado
    UNIQUE (unit_code, unit_symbol)
);

CREATE TABLE dim_feature_type (             -- Origen: valores TYPE de cada capa + nombre de capa
    feature_type_key INTEGER PRIMARY KEY,
    source_layer     TEXT NOT NULL,         -- GeoUnits_v1, GeoContacts, LinearFeatures, SurfaceFeatures, LocationFeatures, megabreccia_fig2
    feature_group    TEXT NOT NULL,         -- Unidad | Contacto | Rasgo lineal | Rasgo superficial | Rasgo puntual | Megabrecha
    feature_type     TEXT NOT NULL,         -- campo TYPE (certain, ridged, lineament, ...) ; 'unit' para GeoUnits_v1
    certainty        TEXT,                  -- certain | approximate | NULL (solo contactos)
    geometry_type    TEXT NOT NULL,         -- Polygon | Line | Point
    UNIQUE (source_layer, feature_type)
);

CREATE TABLE dim_spatial_context (          -- Junk dimension: banderas de interseccion espacial (8 filas)
    spatial_context_key       INTEGER PRIMARY KEY,
    in_landing_ellipse        INTEGER NOT NULL CHECK (in_landing_ellipse IN (0,1)),   -- capa LandingEllipse
    in_figure_area            INTEGER NOT NULL CHECK (in_figure_area IN (0,1)),       -- capa Figures (12 recuadros)
    on_cross_section          INTEGER NOT NULL CHECK (on_cross_section IN (0,1)),     -- capa CrossSections (A, B)
    UNIQUE (in_landing_ellipse, in_figure_area, on_cross_section)
);

-- ---------- TABLA DE HECHOS ----------

CREATE TABLE fact_map_feature (
    feature_key          INTEGER PRIMARY KEY,
    map_key              INTEGER NOT NULL REFERENCES dim_map(map_key),
    unit_key             INTEGER NOT NULL REFERENCES dim_geologic_unit(unit_key),
    feature_type_key     INTEGER NOT NULL REFERENCES dim_feature_type(feature_type_key),
    spatial_context_key  INTEGER NOT NULL REFERENCES dim_spatial_context(spatial_context_key),
    -- dimensiones degeneradas (trazabilidad al origen)
    source_layer         TEXT    NOT NULL,
    source_objectid      INTEGER NOT NULL,
    -- medidas (aditivas)
    feature_count        INTEGER NOT NULL DEFAULT 1,
    length_m             REAL,                -- SHAPE_Length (lineas y perimetro de poligonos)
    area_m2              REAL,                -- SHAPE_Area   (solo poligonos)
    -- atributos geometricos
    centroid_x           REAL,
    centroid_y           REAL,
    geom_wkt             TEXT,
    UNIQUE (source_layer, source_objectid)
);

CREATE INDEX ix_fact_unit    ON fact_map_feature(unit_key);
CREATE INDEX ix_fact_type    ON fact_map_feature(feature_type_key);
CREATE INDEX ix_fact_context ON fact_map_feature(spatial_context_key);

-- ---------- CARGA DE DIMENSIONES ESTATICAS ----------
INSERT INTO dim_geologic_unit VALUES (0,NULL,'No aplica','N/A',NULL,NULL,NULL,NULL);

INSERT INTO dim_feature_type (feature_type_key,source_layer,feature_group,feature_type,certainty,geometry_type) VALUES
 (1,'GeoUnits_v1','Unidad','unit',NULL,'Polygon'),
 (2,'GeoContacts','Contacto','certain','certain','Line'),
 (3,'GeoContacts','Contacto','approximate','approximate','Line'),
 (4,'GeoContacts','Contacto','boundary',NULL,'Line'),
 (5,'LinearFeatures','Rasgo lineal','ridge crest (type 1), certain','certain','Line'),
 (6,'LinearFeatures','Rasgo lineal','lineament',NULL,'Line'),
 (7,'LinearFeatures','Rasgo lineal','crest of crater rim',NULL,'Line'),
 (8,'LinearFeatures','Rasgo lineal','delta lobe front',NULL,'Line'),
 (9,'LinearFeatures','Rasgo lineal','channel (fluvial)',NULL,'Line'),
 (10,'LinearFeatures','Rasgo lineal','crest of buried crater',NULL,'Line'),
 (11,'SurfaceFeatures','Rasgo superficial','dark-colored mantling material',NULL,'Polygon'),
 (12,'SurfaceFeatures','Rasgo superficial','ridged',NULL,'Polygon'),
 (13,'LocationFeatures','Rasgo puntual','small crater',NULL,'Point'),
 (14,'megabreccia_fig2','Megabrecha','megabreccia',NULL,'Point');

INSERT INTO dim_spatial_context (in_landing_ellipse,in_figure_area,on_cross_section)
 SELECT a,b,c FROM (SELECT 0 a UNION SELECT 1) x, (SELECT 0 b UNION SELECT 1) y, (SELECT 0 c UNION SELECT 1) z;

INSERT INTO dim_map VALUES (1,'SIM 3464','Geologic map of Jezero crater and the Nili Planum region, Mars',
 'Vivian Z. Sun; Kathryn M. Stack',2020,'US Geological Survey',75000,'MTM_clon77.5E','Mars2000 Sphere',76.8,77.8,17.7,18.7);

-- Unidades observadas en GeoUnits_v1 (clave natural = unit_code + unit_symbol)
INSERT INTO dim_geologic_unit (unit_key,unit_code,unit_name,unit_symbol,symbol_base,subscript,color_id,age_prefix) VALUES
 (1, 0,'Jezero fan 2 unit','NHjf2','NHjf','2',603,'Noachiano-Hesperiano'),
 (2, 1,'Jezero fan 1 unit','NHjf1','NHjf','1',600,'Noachiano-Hesperiano'),
 (3, 2,'Jezero floor unit','Njf','Njf',NULL,13,'Noachiano'),
 (4, 3,'Lower etched unit','Nle','Nle',NULL,55,'Noachiano'),
 (5, 4,'Nili Planum fan unit','Hnpf','Hnpf',NULL,504,'Hesperiano'),
 (6, 5,'Nili Planum 2 unit','Nnp2','Nnp','2',206,'Noachiano'),
 (7, 6,'Nili Planum 1 unit','Nnp1','Nnp','1',21,'Noachiano'),
 (8, 7,'Eolian bedform unit','Aeb','Aeb',NULL,51,NULL),
 (9, 8,'Smooth unit, undivided','su','su',NULL,250,NULL),
 (10,9,'Rugged bright unit','Nrb','Nrb','2',203,'Noachiano'),
 (11,10,'Upper etched unit','Nue','Nue',NULL,74,'Noachiano'),
 (12,11,'Crater rim unit','cr','cr',NULL,355,NULL),
 (13,12,'Crater ejecta unit','ce','ce',NULL,480,NULL),
 (14,13,'Crater interior unit','ci','ci',NULL,90,NULL),
 (15,5,'Upper etched unit','Nue','Nnp','2',74,'Noachiano');  -- ANOMALIA de origen: 1 poligono con unit=5 pero simbolo Nue (revisar)
