import type { EstacionDetalle, RespuestaMision, ChatResponse } from '../types/mission';

// Fallback high-res Jezero crater imagery from NASA Perseverance
export const MARS_SAMPLE_PHOTOS: Record<string, string> = {
  E1: "https://images-assets.nasa.gov/image/PIA24424/PIA24424~orig.jpg", // Delta scarp
  E2: "https://images-assets.nasa.gov/image/PIA24836/PIA24836~orig.jpg", // Delta top panoramic
  M1: "https://images-assets.nasa.gov/image/PIA24923/PIA24923~orig.jpg", // Séítah bedrock
  M2: "https://images-assets.nasa.gov/image/PIA24483/PIA24483~orig.jpg", // Delta base fine sediment
  HAB: "https://images-assets.nasa.gov/image/PIA24837/PIA24837~orig.jpg", // Jezero floor landing site
  ROV: "https://images-assets.nasa.gov/image/PIA24750/PIA24750~orig.jpg", // Perseverance rover selfie
  REF: "https://images-assets.nasa.gov/image/PIA24422/PIA24422~orig.jpg", // Rock shelter formation
  COM: "https://images-assets.nasa.gov/image/PIA24377/PIA24377~orig.jpg", // Antenna mast
};

export const MOCK_ESTACIONES: EstacionDetalle[] = [
  {
    id: "HAB",
    nombre: "Hábitat Octavia",
    tipo: "habitat",
    lon: 77.4508,
    lat: 18.4447,
    valor_cientifico: 0,
    tarea: "Base de la misión",
    permanencia_min: 0,
    unidad_geologica: "Fondo del cráter (Octavia E. Butler Landing)",
    zona: "Z4",
    capas: {
      elev_m: -2569,
      pendiente_deg: 3,
      themis_noche: 205
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.HAB, camara: "NAVCAM_LEFT", sol: 12 }]
  },
  {
    id: "ROV",
    nombre: "Rover de apoyo",
    tipo: "rover",
    lon: 77.443,
    lat: 18.4525,
    valor_cientifico: 1,
    tarea: "Recarga de soporte vital y relevo de muestras",
    permanencia_min: 10,
    unidad_geologica: "Fondo del cráter",
    zona: "Z4",
    capas: {
      elev_m: -2566,
      pendiente_deg: 4.5,
      themis_noche: 207
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.ROV, camara: "MASTCAM_Z", sol: 45 }]
  },
  {
    id: "E1",
    nombre: "Frente del delta",
    tipo: "ciencia",
    lon: 77.412,
    lat: 18.4495,
    valor_cientifico: 9,
    tarea: "Muestreo de capas sedimentarias lacustres",
    permanencia_min: 25,
    unidad_geologica: "Delta, frente escarpado",
    zona: "Z1",
    capas: {
      elev_m: -2530,
      pendiente_deg: 12,
      themis_noche: 222
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.E1, camara: "MASTCAM_Z", sol: 415 }]
  },
  {
    id: "M1",
    nombre: "Muestreo borde de Séítah",
    tipo: "muestreo",
    lon: 77.439,
    lat: 18.4385,
    valor_cientifico: 7,
    tarea: "Extracción de núcleo de roca ígnea olivínica",
    permanencia_min: 15,
    unidad_geologica: "Séítah, roca expuesta",
    zona: "Z3",
    capas: {
      elev_m: -2574,
      pendiente_deg: 8,
      themis_noche: 230
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.M1, camara: "SHERLOC_WATSON", sol: 210 }]
  },
  {
    id: "M2",
    nombre: "Muestreo base del delta",
    tipo: "muestreo",
    lon: 77.4185,
    lat: 18.443,
    valor_cientifico: 6,
    tarea: "Recolección de sedimento fino arcilloso",
    permanencia_min: 15,
    unidad_geologica: "Delta, depósitos distales",
    zona: "Z1",
    capas: {
      elev_m: -2552,
      pendiente_deg: 9.5,
      themis_noche: 214
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.M2, camara: "NAVCAM_RIGHT", sol: 420 }]
  },
  {
    id: "E2",
    nombre: "Cima del delta",
    tipo: "ciencia",
    lon: 77.414,
    lat: 18.458,
    valor_cientifico: 8,
    tarea: "Panorámica orbital cruzada y estratigrafía",
    permanencia_min: 20,
    unidad_geologica: "Delta, capa superior",
    zona: "Z1",
    capas: {
      elev_m: -2495,
      pendiente_deg: 18.5,
      themis_noche: 225
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.E2, camara: "MASTCAM_Z", sol: 512 }]
  },
  {
    id: "REF",
    nombre: "Refugio de roca",
    tipo: "refugio",
    lon: 77.425,
    lat: 18.456,
    valor_cientifico: 2,
    tarea: "Punto de refugio presurizado ante tormenta de polvo",
    permanencia_min: 10,
    unidad_geologica: "Llanura norte",
    zona: "Z4",
    capas: {
      elev_m: -2558,
      pendiente_deg: 6,
      themis_noche: 218
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.REF, camara: "NAVCAM_LEFT", sol: 88 }]
  },
  {
    id: "COM",
    nombre: "Repetidora de comunicaciones",
    tipo: "comms",
    lon: 77.434,
    lat: 18.458,
    valor_cientifico: 1,
    tarea: "Inspección de enlace UHF Mars Relay Network",
    permanencia_min: 10,
    unidad_geologica: "Llanura norte",
    zona: "Z4",
    capas: {
      elev_m: -2545,
      pendiente_deg: 9,
      themis_noche: 216
    },
    fotos: [{ url: MARS_SAMPLE_PHOTOS.COM, camara: "HAZCAM_FRONT", sol: 104 }]
  }
];

export const MOCK_MISION_15DEG: RespuestaMision = {
  factible: true,
  ruta: ["HAB", "E1", "M2", "M1", "HAB"],
  tramos: [
    {
      origen: "HAB",
      destino: "E1",
      distancia_m: 2376,
      tiempo_min: 41.2,
      pendiente_max_deg: 14.0,
      cobertura_com_pct: 100,
      dosis_rel: 36.7,
      zonas: ["Z1", "Z2", "Z4"],
      geometria: [
        [77.4508, 18.4447],
        [77.4443, 18.4454],
        [77.4378, 18.4462],
        [77.4313, 18.4469],
        [77.4249, 18.4478],
        [77.4184, 18.4486],
        [77.412, 18.4495]
      ]
    },
    {
      origen: "E1",
      destino: "M2",
      distancia_m: 574,
      tiempo_min: 8.6,
      pendiente_max_deg: 12.2,
      cobertura_com_pct: 100,
      dosis_rel: 6.4,
      zonas: ["Z1"],
      geometria: [
        [77.412, 18.4495],
        [77.4151, 18.4461],
        [77.4185, 18.443]
      ]
    },
    {
      origen: "M2",
      destino: "M1",
      distancia_m: 1278,
      tiempo_min: 20.2,
      pendiente_max_deg: 10.5,
      cobertura_com_pct: 100,
      dosis_rel: 17.5,
      zonas: ["Z1", "Z3", "Z4"],
      geometria: [
        [77.4185, 18.443],
        [77.4287, 18.4407],
        [77.439, 18.4385]
      ]
    },
    {
      origen: "M1",
      destino: "HAB",
      distancia_m: 819,
      tiempo_min: 13.4,
      pendiente_max_deg: 8.3,
      cobertura_com_pct: 100,
      dosis_rel: 12.0,
      zonas: ["Z3", "Z4"],
      geometria: [
        [77.439, 18.4385],
        [77.4448, 18.4417],
        [77.4508, 18.4447]
      ]
    }
  ],
  omitidas: [
    {
      id: "E2",
      motivo: "pendiente",
      detalle: {
        pendiente_max_deg: 18.6,
        limite: 15
      }
    }
  ],
  totales: {
    distancia_m: 5047,
    tiempo_min: 138.4,
    dosis_rel: 72.6,
    margen_min: 41.6
  }
};

export const MOCK_MISION_20DEG: RespuestaMision = {
  factible: true,
  ruta: ["HAB", "E1", "E2", "M2", "M1", "HAB"],
  tramos: [
    {
      origen: "HAB",
      destino: "E1",
      distancia_m: 2376,
      tiempo_min: 41.2,
      pendiente_max_deg: 14.0,
      cobertura_com_pct: 100,
      dosis_rel: 36.7,
      zonas: ["Z1", "Z2", "Z4"],
      geometria: [[77.4508, 18.4447], [77.412, 18.4495]]
    },
    {
      origen: "E1",
      destino: "E2",
      distancia_m: 950,
      tiempo_min: 16.8,
      pendiente_max_deg: 18.6,
      cobertura_com_pct: 100,
      dosis_rel: 14.2,
      zonas: ["Z1"],
      geometria: [[77.412, 18.4495], [77.414, 18.458]]
    },
    {
      origen: "E2",
      destino: "M2",
      distancia_m: 1680,
      tiempo_min: 24.5,
      pendiente_max_deg: 15.2,
      cobertura_com_pct: 95,
      dosis_rel: 21.0,
      zonas: ["Z1"],
      geometria: [[77.414, 18.458], [77.4185, 18.443]]
    },
    {
      origen: "M2",
      destino: "M1",
      distancia_m: 1278,
      tiempo_min: 20.2,
      pendiente_max_deg: 10.5,
      cobertura_com_pct: 100,
      dosis_rel: 17.5,
      zonas: ["Z1", "Z3", "Z4"],
      geometria: [[77.4185, 18.443], [77.439, 18.4385]]
    },
    {
      origen: "M1",
      destino: "HAB",
      distancia_m: 819,
      tiempo_min: 13.4,
      pendiente_max_deg: 8.3,
      cobertura_com_pct: 100,
      dosis_rel: 12.0,
      zonas: ["Z3", "Z4"],
      geometria: [[77.439, 18.4385], [77.4508, 18.4447]]
    }
  ],
  omitidas: [],
  totales: {
    distancia_m: 7103,
    tiempo_min: 176.1,
    dosis_rel: 101.4,
    margen_min: 3.9
  }
};

export const MOCK_CHAT_FLOW: Record<string, ChatResponse> = {
  demo1: {
    respuesta: "Ruta calculada con pendiente máxima de 15°. Visitarás el Frente del delta (E1), Base del delta (M2) y Borde de Séítah (M1) con retorno al Hábitat. Tiempo estimado de marcha y permanencia: 138.4 minutos (margen disponible: 41.6 min). Omití la Cima del delta (E2) porque su camino más suave tiene 18.6° de pendiente.",
    llamadas: [
      {
        herramienta: "optimizar_mision",
        argumentos: {
          estaciones: ["E1", "M1", "M2", "E2"],
          tiempo_max_min: 180,
          pendiente_max: 15,
          modo: "orientacion"
        },
        ok: true
      }
    ],
    ruta: MOCK_MISION_15DEG
  },
  demo2: {
    respuesta: "Al permitir pendientes de hasta 20°, ahora es factible incorporar la Cima del delta (E2). La nueva ruta recorre HAB → E1 → E2 → M2 → M1 → HAB. El tiempo total sube a 176.1 minutos (añade 37.7 min de marcha y permanencia), con un margen remanente seguro de 3.9 min dentro del límite de 3 horas.",
    llamadas: [
      {
        herramienta: "optimizar_mision",
        argumentos: {
          estaciones: ["E1", "M1", "M2", "E2"],
          tiempo_max_min: 180,
          pendiente_max: 20,
          modo: "orientacion"
        },
        ok: true
      }
    ],
    ruta: MOCK_MISION_20DEG
  },
  demo3: {
    respuesta: "¡Alerta de polvo recibida en Zona Z2 (Campo de dunas)! He recalculado la caminata eliminando el tramo directo que atravesaba Z2. Se trazó un desvío por la meseta norte para mantener la seguridad del astronauta.",
    llamadas: [
      {
        herramienta: "recalcular_por_alerta",
        argumentos: {
          zona: "Z2",
          tipo: "polvo"
        },
        ok: true
      }
    ],
    ruta: {
      ...MOCK_MISION_15DEG,
      aristas_afectadas: ["HAB->E1"]
    }
  }
};
