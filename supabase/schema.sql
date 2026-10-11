-- Esquema del sistema interno Corpotex (MVP).
-- Pegar completo en Supabase > SQL Editor > Run.
-- Productos, áreas, capacidades y rutas viven en el código (src/lib/catalogo.ts).

create table if not exists cotizaciones (
  codigo text primary key,
  cliente jsonb not null,
  items jsonb not null,
  -- Ruta del diseño dentro del bucket privado "disenos".
  diseno_archivo text,
  precio_total numeric,
  fecha_estimada date,
  creado_en timestamptz not null default now()
);

create sequence if not exists pedidos_seq start 1;

create table if not exists pedidos (
  id bigint generated always as identity primary key,
  codigo text not null unique default 'P-' || lpad(nextval('pedidos_seq')::text, 4, '0'),
  cliente_nombre text not null,
  cliente_empresa text,
  cliente_telefono text,
  canal text not null check (canal in ('web', 'presencial')),
  cotizacion_codigo text references cotizaciones (codigo),
  urgente boolean not null default false,
  hay_tela boolean not null default true,
  estado text not null default 'confirmado'
    check (estado in ('borrador', 'confirmado', 'en_produccion', 'listo', 'entregado', 'cancelado')),
  -- Almacén trabaja el pedido completo. Los bloques se crean con el pedido,
  -- pero no aparecen en las áreas hasta que almacen_estado = 'terminado'.
  almacen_estado text not null default 'en_cola'
    check (almacen_estado in ('en_cola', 'en_proceso', 'detenido', 'terminado')),
  almacen_inicio timestamptz,
  fecha_prometida date,
  creado_en timestamptz not null default now()
);

create table if not exists pedido_items (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references pedidos (id) on delete cascade,
  producto text not null,
  cantidad integer not null check (cantidad > 0),
  personalizacion text not null
    check (personalizacion in ('ninguna', 'bordado', 'dtf', 'sublimado', 'bordado_dtf')),
  color text,
  tallas jsonb,
  notas text
);

create table if not exists bloques (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references pedidos (id) on delete cascade,
  item_id bigint not null references pedido_items (id) on delete cascade,
  numero integer not null,
  cantidad integer not null check (cantidad > 0),
  familia text not null,
  -- Áreas por las que pasa después de Almacén, en orden.
  ruta text[] not null,
  -- Posición en la ruta; cuando paso = largo de la ruta, el bloque está terminado.
  paso integer not null default 0,
  estado text not null default 'en_cola'
    check (estado in ('en_cola', 'en_proceso', 'detenido', 'terminado')),
  inicio_paso timestamptz,
  unique (pedido_id, numero)
);

create index if not exists bloques_pedido on bloques (pedido_id);

-- Historial de toques en las tabletas; de aquí salen las alertas y la recalibración.
create table if not exists eventos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references pedidos (id) on delete cascade,
  bloque_id bigint references bloques (id) on delete cascade,
  area text not null,
  tipo text not null check (tipo in ('empezar', 'terminar', 'problema', 'resuelto')),
  detalle text,
  creado_en timestamptz not null default now()
);

create index if not exists eventos_area on eventos (area, creado_en desc);

-- PIN de entrada por área y por rol (almacen, corte, ..., ventas, jefe, gerencia, admin).
-- El PIN se guarda cifrado; lo cambia el administrador en /accesos o con "npm run pines".
create table if not exists accesos (
  rol text primary key,
  pin text not null,
  actualizado_en timestamptz not null default now()
);

-- Diseños que sube el cliente en la web; se leen con enlaces temporales.
insert into storage.buckets (id, name, public)
values ('disenos', 'disenos', false)
on conflict (id) do nothing;

-- Solo el servidor (clave service_role) toca las tablas y los archivos.
alter table cotizaciones enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table bloques enable row level security;
alter table eventos enable row level security;
alter table accesos enable row level security;
