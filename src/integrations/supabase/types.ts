export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      asistencia: {
        Row: {
          bono: number | null
          hora_entrada: string | null
          hora_salida: string | null
          horas_trabajadas: number | null
          id: string
          notas: string | null
          sucursal_id: string
          turno_id: string
          usuario_id: string
        }
        Insert: {
          bono?: number | null
          hora_entrada?: string | null
          hora_salida?: string | null
          horas_trabajadas?: number | null
          id?: string
          notas?: string | null
          sucursal_id: string
          turno_id: string
          usuario_id: string
        }
        Update: {
          bono?: number | null
          hora_entrada?: string | null
          hora_salida?: string | null
          horas_trabajadas?: number | null
          id?: string
          notas?: string | null
          sucursal_id?: string
          turno_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
          {
            foreignKeyName: "asistencia_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cambios_turno: {
        Row: {
          created_at: string
          diferencia: number | null
          efectivo_declarado: number
          efectivo_sistema: number
          id: string
          observacion: string | null
          tomador_entrante_id: string
          tomador_saliente_id: string
          turno_id: string
        }
        Insert: {
          created_at?: string
          diferencia?: number | null
          efectivo_declarado: number
          efectivo_sistema: number
          id?: string
          observacion?: string | null
          tomador_entrante_id: string
          tomador_saliente_id: string
          turno_id: string
        }
        Update: {
          created_at?: string
          diferencia?: number | null
          efectivo_declarado?: number
          efectivo_sistema?: number
          id?: string
          observacion?: string | null
          tomador_entrante_id?: string
          tomador_saliente_id?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_turno_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          id: string
          nombre: string
          orden: number | null
        }
        Insert: {
          id?: string
          nombre: string
          orden?: number | null
        }
        Update: {
          id?: string
          nombre?: string
          orden?: number | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          created_at: string | null
          fecha_nacimiento: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
          total_gastado: number | null
          total_pedidos: number | null
        }
        Insert: {
          created_at?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
          total_gastado?: number | null
          total_pedidos?: number | null
        }
        Update: {
          created_at?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
          total_gastado?: number | null
          total_pedidos?: number | null
        }
        Relationships: []
      }
      configuracion_sucursal: {
        Row: {
          created_at: string | null
          id: string
          impresora_cocina: string | null
          impresora_toma: string | null
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          impresora_cocina?: string | null
          impresora_toma?: string | null
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          impresora_cocina?: string | null
          impresora_toma?: string | null
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: true
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracion_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
        ]
      }
      cupones: {
        Row: {
          codigo: string
          created_at: string | null
          fecha_uso: string | null
          id: string
          pedido_id: string | null
          usado: boolean | null
        }
        Insert: {
          codigo: string
          created_at?: string | null
          fecha_uso?: string | null
          id?: string
          pedido_id?: string | null
          usado?: boolean | null
        }
        Update: {
          codigo?: string
          created_at?: string | null
          fecha_uso?: string | null
          id?: string
          pedido_id?: string | null
          usado?: boolean | null
        }
        Relationships: []
      }
      despachos_manuales: {
        Row: {
          actualizado_por: string | null
          concepto: string
          creado_por: string | null
          created_at: string | null
          despachador_id: string
          id: string
          monto: number
          turno_id: string
          updated_at: string | null
        }
        Insert: {
          actualizado_por?: string | null
          concepto: string
          creado_por?: string | null
          created_at?: string | null
          despachador_id: string
          id?: string
          monto: number
          turno_id: string
          updated_at?: string | null
        }
        Update: {
          actualizado_por?: string | null
          concepto?: string
          creado_por?: string | null
          created_at?: string | null
          despachador_id?: string
          id?: string
          monto?: number
          turno_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despachos_manuales_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_manuales_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_manuales_despachador_id_fkey"
            columns: ["despachador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_manuales_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      despachos_manuales_cambios: {
        Row: {
          changed_at: string
          concepto: string
          despachador_id: string
          despacho_id: string
          id: string
          monto_anterior: number | null
          monto_nuevo: number | null
          operacion: string
          turno_id: string
          usuario_id: string | null
        }
        Insert: {
          changed_at?: string
          concepto: string
          despachador_id: string
          despacho_id: string
          id?: string
          monto_anterior?: number | null
          monto_nuevo?: number | null
          operacion: string
          turno_id: string
          usuario_id?: string | null
        }
        Update: {
          changed_at?: string
          concepto?: string
          despachador_id?: string
          despacho_id?: string
          id?: string
          monto_anterior?: number | null
          monto_nuevo?: number | null
          operacion?: string
          turno_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despachos_manuales_cambios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      direcciones_cliente: {
        Row: {
          cliente_id: string
          direccion: string
          es_principal: boolean | null
          id: string
          latitud: number | null
          longitud: number | null
          referencia: string | null
        }
        Insert: {
          cliente_id: string
          direccion: string
          es_principal?: boolean | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          referencia?: string | null
        }
        Update: {
          cliente_id?: string
          direccion?: string
          es_principal?: boolean | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direcciones_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_turno: {
        Row: {
          concepto: string
          created_at: string | null
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"] | null
          monto: number
          turno_id: string
          usuario_id: string | null
        }
        Insert: {
          concepto: string
          created_at?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"] | null
          monto: number
          turno_id: string
          usuario_id?: string | null
        }
        Update: {
          concepto?: string
          created_at?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"] | null
          monto?: number
          turno_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_turno_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_turno_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_precios: {
        Row: {
          created_at: string | null
          id: string
          precio_anterior: number
          precio_nuevo: number
          producto_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          precio_anterior: number
          precio_nuevo: number
          producto_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          precio_anterior?: number
          precio_nuevo?: number
          producto_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_precios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          activo: boolean | null
          costo_unitario: number
          formato_mayor: string | null
          id: string
          ml_por_unidad: number | null
          nombre: string
          grupo_inventario: string | null
          maximo_conteo: number | null
          orden_presentacion: number
          orden_visual: number | null
          paso_conteo: number
          presentacion_inventario: string | null
          seccion_inventario: string
          tipo: string
          tipo_conteo: string
          unidad: string | null
          unidad_logistica: string | null
          unidades_por_formato: number | null
        }
        Insert: {
          activo?: boolean | null
          costo_unitario?: number
          formato_mayor?: string | null
          id?: string
          ml_por_unidad?: number | null
          nombre: string
          grupo_inventario?: string | null
          maximo_conteo?: number | null
          orden_presentacion?: number
          orden_visual?: number | null
          paso_conteo?: number
          presentacion_inventario?: string | null
          seccion_inventario?: string
          tipo: string
          tipo_conteo?: string
          unidad?: string | null
          unidad_logistica?: string | null
          unidades_por_formato?: number | null
        }
        Update: {
          activo?: boolean | null
          costo_unitario?: number
          formato_mayor?: string | null
          id?: string
          ml_por_unidad?: number | null
          nombre?: string
          grupo_inventario?: string | null
          maximo_conteo?: number | null
          orden_presentacion?: number
          orden_visual?: number | null
          paso_conteo?: number
          presentacion_inventario?: string | null
          seccion_inventario?: string
          tipo?: string
          tipo_conteo?: string
          unidad?: string | null
          unidad_logistica?: string | null
          unidades_por_formato?: number | null
        }
        Relationships: []
      }
      inventario_cierre: {
        Row: {
          cantidad_ideal: number
          cantidad_real: number | null
          conteo_original: string | null
          created_at: string | null
          diferencia: number | null
          id: string
          insumo_id: string
          turno_id: string
        }
        Insert: {
          cantidad_ideal: number
          cantidad_real?: number | null
          conteo_original?: string | null
          created_at?: string | null
          diferencia?: number | null
          id?: string
          insumo_id: string
          turno_id: string
        }
        Update: {
          cantidad_ideal?: number
          cantidad_real?: number | null
          conteo_original?: string | null
          created_at?: string | null
          diferencia?: number | null
          id?: string
          insumo_id?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_cierre_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_cierre_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventarios_parciales: {
        Row: {
          conteo_jarros_at: string | null
          created_at: string
          id: string
          jarros_cajas_con_sticker: number | null
          jarros_cajas_sin_sticker: number | null
          jarros_rotos: number | null
          jarros_sueltos: number | null
          motivo: string
          sucursal_id: string
          turno_id: string
          usuario_id: string | null
        }
        Insert: {
          conteo_jarros_at?: string | null
          created_at?: string
          id?: string
          jarros_cajas_con_sticker?: number | null
          jarros_cajas_sin_sticker?: number | null
          jarros_rotos?: number | null
          jarros_sueltos?: number | null
          motivo?: string
          sucursal_id: string
          turno_id: string
          usuario_id?: string | null
        }
        Update: {
          conteo_jarros_at?: string | null
          created_at?: string
          id?: string
          jarros_cajas_con_sticker?: number | null
          jarros_cajas_sin_sticker?: number | null
          jarros_rotos?: number | null
          jarros_sueltos?: number | null
          motivo?: string
          sucursal_id?: string
          turno_id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      inventarios_parciales_items: {
        Row: {
          cantidad_real: number
          conteo_original: string | null
          id: string
          insumo_id: string
          inventario_id: string
        }
        Insert: {
          cantidad_real?: number
          conteo_original?: string | null
          id?: string
          insumo_id: string
          inventario_id: string
        }
        Update: {
          cantidad_real?: number
          conteo_original?: string | null
          id?: string
          insumo_id?: string
          inventario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_parciales_items_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios_parciales"
            referencedColumns: ["id"]
          },
        ]
      }
      log_cambios_pedido: {
        Row: {
          campo: string
          created_at: string | null
          estado_pedido: Database["public"]["Enums"]["estado_pedido"] | null
          id: string
          motivo: string | null
          pedido_id: string | null
          sucursal_id: string | null
          tipo_evento: string | null
          usuario_id: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          created_at?: string | null
          estado_pedido?: Database["public"]["Enums"]["estado_pedido"] | null
          id?: string
          motivo?: string | null
          pedido_id?: string | null
          sucursal_id?: string | null
          tipo_evento?: string | null
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          created_at?: string | null
          estado_pedido?: Database["public"]["Enums"]["estado_pedido"] | null
          id?: string
          motivo?: string | null
          pedido_id?: string | null
          sucursal_id?: string | null
          tipo_evento?: string | null
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_cambios_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_cambios_pedido_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_cambios_pedido_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pago_despachadores: {
        Row: {
          base_por_horas: number | null
          bono: number | null
          cierre_parcial: boolean | null
          despachador_id: string
          fecha_pago: string | null
          horas_trabajadas: number | null
          id: string
          pagado: boolean | null
          pedidos_entregados: number | null
          total_a_pagar: number
          total_despachos_cobrados: number | null
          turno_id: string
          valor_hora: number | null
        }
        Insert: {
          base_por_horas?: number | null
          bono?: number | null
          cierre_parcial?: boolean | null
          despachador_id: string
          fecha_pago?: string | null
          horas_trabajadas?: number | null
          id?: string
          pagado?: boolean | null
          pedidos_entregados?: number | null
          total_a_pagar?: number
          total_despachos_cobrados?: number | null
          turno_id: string
          valor_hora?: number | null
        }
        Update: {
          base_por_horas?: number | null
          bono?: number | null
          cierre_parcial?: boolean | null
          despachador_id?: string
          fecha_pago?: string | null
          horas_trabajadas?: number | null
          id?: string
          pagado?: boolean | null
          pedidos_entregados?: number | null
          total_a_pagar?: number
          total_despachos_cobrados?: number | null
          turno_id?: string
          valor_hora?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pago_despachadores_despachador_id_fkey"
            columns: ["despachador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_despachadores_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_turno: {
        Row: {
          created_at: string | null
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          pedido_id: string | null
          referencia: string | null
          turno_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          pedido_id?: string | null
          referencia?: string | null
          turno_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          pedido_id?: string | null
          referencia?: string | null
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_turno_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          descuento_item: number | null
          id: string
          notas: string | null
          pedido_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Insert: {
          cantidad?: number
          descuento_item?: number | null
          id?: string
          notas?: string | null
          pedido_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Update: {
          cantidad?: number
          descuento_item?: number | null
          id?: string
          notas?: string | null
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cliente_id: string | null
          cliente_nombre: string
          cliente_telefono: string | null
          comanda_impresa: boolean | null
          costo_despacho: number | null
          costo_despacho_calculado: number | null
          created_at: string | null
          cupon_id: string | null
          descuento: number | null
          despachador_id: string | null
          direccion_entrega: string | null
          distancia_km: number | null
          es_jarra_dorada: boolean | null
          estado: Database["public"]["Enums"]["estado_pedido"]
          estado_confirmacion: string
          hora_agendada: string | null
          id: string
          jarros_entregados: number | null
          jarros_prometidos: number | null
          latitud_entrega: number | null
          longitud_entrega: number | null
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido: number | null
          motivo_rechazo: string | null
          notas: string | null
          numero_pedido: number | null
          numero_pedido_global: number | null
          origen: string
          pago_esperado_efectivo: number | null
          pago_esperado_tarjeta: number | null
          pago_esperado_transferencia: number | null
          pago_registrado: boolean | null
          promo_tipo: Database["public"]["Enums"]["tipo_promo"] | null
          referencia_entrega: string | null
          referencia_pago: string | null
          requiere_revision_cocina: boolean
          subtotal: number
          sucursal_id: string
          sync_id: string | null
          tiempo_estimado_minutos: number | null
          tipo: Database["public"]["Enums"]["tipo_pedido"]
          tomador_id: string | null
          total: number
          turno_id: string | null
          updated_at: string | null
          vuelto: number | null
        }
        Insert: {
          cliente_id?: string | null
          cliente_nombre: string
          cliente_telefono?: string | null
          comanda_impresa?: boolean | null
          costo_despacho?: number | null
          costo_despacho_calculado?: number | null
          created_at?: string | null
          cupon_id?: string | null
          descuento?: number | null
          despachador_id?: string | null
          direccion_entrega?: string | null
          distancia_km?: number | null
          es_jarra_dorada?: boolean | null
          estado?: Database["public"]["Enums"]["estado_pedido"]
          estado_confirmacion?: string
          hora_agendada?: string | null
          id?: string
          jarros_entregados?: number | null
          jarros_prometidos?: number | null
          latitud_entrega?: number | null
          longitud_entrega?: number | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido?: number | null
          motivo_rechazo?: string | null
          notas?: string | null
          numero_pedido?: number | null
          numero_pedido_global?: number | null
          origen?: string
          pago_esperado_efectivo?: number | null
          pago_esperado_tarjeta?: number | null
          pago_esperado_transferencia?: number | null
          pago_registrado?: boolean | null
          promo_tipo?: Database["public"]["Enums"]["tipo_promo"] | null
          referencia_entrega?: string | null
          referencia_pago?: string | null
          requiere_revision_cocina?: boolean
          subtotal: number
          sucursal_id: string
          sync_id?: string | null
          tiempo_estimado_minutos?: number | null
          tipo?: Database["public"]["Enums"]["tipo_pedido"]
          tomador_id?: string | null
          total: number
          turno_id?: string | null
          updated_at?: string | null
          vuelto?: number | null
        }
        Update: {
          cliente_id?: string | null
          cliente_nombre?: string
          cliente_telefono?: string | null
          comanda_impresa?: boolean | null
          costo_despacho?: number | null
          costo_despacho_calculado?: number | null
          created_at?: string | null
          cupon_id?: string | null
          descuento?: number | null
          despachador_id?: string | null
          direccion_entrega?: string | null
          distancia_km?: number | null
          es_jarra_dorada?: boolean | null
          estado?: Database["public"]["Enums"]["estado_pedido"]
          estado_confirmacion?: string
          hora_agendada?: string | null
          id?: string
          jarros_entregados?: number | null
          jarros_prometidos?: number | null
          latitud_entrega?: number | null
          longitud_entrega?: number | null
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_recibido?: number | null
          motivo_rechazo?: string | null
          notas?: string | null
          numero_pedido?: number | null
          numero_pedido_global?: number | null
          origen?: string
          pago_esperado_efectivo?: number | null
          pago_esperado_tarjeta?: number | null
          pago_esperado_transferencia?: number | null
          pago_registrado?: boolean | null
          promo_tipo?: Database["public"]["Enums"]["tipo_promo"] | null
          referencia_entrega?: string | null
          referencia_pago?: string | null
          requiere_revision_cocina?: boolean
          subtotal?: number
          sucursal_id?: string
          sync_id?: string | null
          tiempo_estimado_minutos?: number | null
          tipo?: Database["public"]["Enums"]["tipo_pedido"]
          tomador_id?: string | null
          total?: number
          turno_id?: string | null
          updated_at?: string | null
          vuelto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cupon_id_fkey"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_despachador_id_fkey"
            columns: ["despachador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
          {
            foreignKeyName: "pedidos_tomador_id_fkey"
            columns: ["tomador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_despacho_ajustes: {
        Row: {
          changed_at: string
          costo_anterior: number | null
          costo_calculado: number
          costo_cobrado: number
          diferencia: number | null
          distancia_km: number | null
          id: string
          motivo: string | null
          numero_pedido: number | null
          operacion: string
          pedido_id: string
          sucursal_id: string
          estado_pedido: Database["public"]["Enums"]["estado_pedido"] | null
          turno_id: string
          usuario_id: string | null
        }
        Insert: {
          changed_at?: string
          costo_anterior?: number | null
          costo_calculado: number
          costo_cobrado: number
          diferencia?: number | null
          distancia_km?: number | null
          id?: string
          motivo?: string | null
          numero_pedido?: number | null
          operacion: string
          pedido_id: string
          sucursal_id: string
          estado_pedido?: Database["public"]["Enums"]["estado_pedido"] | null
          turno_id: string
          usuario_id?: string | null
        }
        Update: {
          changed_at?: string
          costo_anterior?: number | null
          costo_calculado?: number
          costo_cobrado?: number
          diferencia?: number | null
          distancia_km?: number | null
          id?: string
          motivo?: string | null
          numero_pedido?: number | null
          operacion?: string
          pedido_id?: string
          sucursal_id?: string
          estado_pedido?: Database["public"]["Enums"]["estado_pedido"] | null
          turno_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_despacho_ajustes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_logistica: {
        Row: {
          chofer_id: string | null
          created_at: string | null
          encargado_id: string | null
          estado: string | null
          id: string
          iniciado_por_bodega: boolean
          notas: string | null
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          chofer_id?: string | null
          created_at?: string | null
          encargado_id?: string | null
          estado?: string | null
          id?: string
          iniciado_por_bodega?: boolean
          notas?: string | null
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          chofer_id?: string | null
          created_at?: string | null
          encargado_id?: string | null
          estado?: string | null
          id?: string
          iniciado_por_bodega?: boolean
          notas?: string | null
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_logistica_chofer_id_fkey"
            columns: ["chofer_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_logistica_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_logistica_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_logistica_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
        ]
      }
      pedidos_logistica_items: {
        Row: {
          cantidad_enviada: number | null
          cantidad_solicitada: number
          id: string
          insumo_id: string
          notas: string | null
          pedido_id: string
        }
        Insert: {
          cantidad_enviada?: number | null
          cantidad_solicitada: number
          id?: string
          insumo_id: string
          notas?: string | null
          pedido_id: string
        }
        Update: {
          cantidad_enviada?: number | null
          cantidad_solicitada?: number
          id?: string
          insumo_id?: string
          notas?: string | null
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_logistica_items_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_logistica_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_logistica"
            referencedColumns: ["id"]
          },
        ]
      }
      precios_trabajador: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          precio_trabajador: number
          producto_id: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          precio_trabajador: number
          producto_id: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          precio_trabajador?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precios_trabajador_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      prestamos_despachador: {
        Row: {
          created_at: string
          despachador_id: string
          devuelto: boolean
          id: string
          monto: number
          turno_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          despachador_id: string
          devuelto?: boolean
          id?: string
          monto: number
          turno_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          despachador_id?: string
          devuelto?: boolean
          id?: string
          monto?: number
          turno_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestamos_despachador_despachador_id_fkey"
            columns: ["despachador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestamos_despachador_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean | null
          categoria_id: string | null
          created_at: string | null
          id: string
          imagen_url: string | null
          nombre: string
          precio: number
          tiene_alcohol: boolean | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria_id?: string | null
          created_at?: string | null
          id?: string
          imagen_url?: string | null
          nombre: string
          precio: number
          tiene_alcohol?: boolean | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria_id?: string | null
          created_at?: string | null
          id?: string
          imagen_url?: string | null
          nombre?: string
          precio?: number
          tiene_alcohol?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones: {
        Row: {
          activo: boolean | null
          created_at: string | null
          descripcion: string | null
          dias_activos: string[] | null
          id: string
          nombre: string
          precio_especial: number | null
          producto_id: string | null
          tipo: Database["public"]["Enums"]["tipo_promo"]
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          dias_activos?: string[] | null
          id?: string
          nombre: string
          precio_especial?: number | null
          producto_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_promo"]
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          dias_activos?: string[] | null
          id?: string
          nombre?: string
          precio_especial?: number | null
          producto_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_promo"]
        }
        Relationships: [
          {
            foreignKeyName: "promociones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones_precio: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string | null
          precio_promo: number
          producto_id: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string | null
          precio_promo: number
          producto_id: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string | null
          precio_promo?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promociones_precio_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          insumo_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sabores_extra: {
        Row: {
          activo: boolean | null
          id: string
          nombre: string
          precio: number
        }
        Insert: {
          activo?: boolean | null
          id?: string
          nombre: string
          precio?: number
        }
        Update: {
          activo?: boolean | null
          id?: string
          nombre?: string
          precio?: number
        }
        Relationships: []
      }
      stock_bodega_central: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          stock_minimo: number | null
          updated_at: string | null
        }
        Insert: {
          cantidad?: number
          id?: string
          insumo_id: string
          stock_minimo?: number | null
          updated_at?: string | null
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          stock_minimo?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_bodega_central_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movimientos: {
        Row: {
          cantidad: number
          created_at: string | null
          es_bodega: boolean | null
          id: string
          insumo_id: string
          notas: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          sucursal_id: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          es_bodega?: boolean | null
          id?: string
          insumo_id: string
          notas?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          sucursal_id?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          es_bodega?: boolean | null
          id?: string
          insumo_id?: string
          notas?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          sucursal_id?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movimientos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movimientos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
          {
            foreignKeyName: "stock_movimientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sucursal: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          stock_minimo: number | null
          stock_minimo_critico: number
          stock_minimo_observacion: number
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          cantidad?: number
          id?: string
          insumo_id: string
          stock_minimo?: number | null
          stock_minimo_critico?: number
          stock_minimo_observacion?: number
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          stock_minimo?: number | null
          stock_minimo_critico?: number
          stock_minimo_observacion?: number
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_sucursal_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
        ]
      }
      sucursales: {
        Row: {
          activo: boolean | null
          clave_canje: string | null
          created_at: string | null
          direccion: string
          id: string
          latitud: number | null
          longitud: number | null
          nombre: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          clave_canje?: string | null
          created_at?: string | null
          direccion: string
          id?: string
          latitud?: number | null
          longitud?: number | null
          nombre: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          clave_canje?: string | null
          created_at?: string | null
          direccion?: string
          id?: string
          latitud?: number | null
          longitud?: number | null
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      tarifas_despachador: {
        Row: {
          descripcion: string
          horas: number
          id: string
          monto: number
          updated_at: string
        }
        Insert: {
          descripcion: string
          horas: number
          id?: string
          monto?: number
          updated_at?: string
        }
        Update: {
          descripcion?: string
          horas?: number
          id?: string
          monto?: number
          updated_at?: string
        }
        Relationships: []
      }
      tarifas_despacho: {
        Row: {
          descripcion: string
          distancia_desde: number
          distancia_hasta: number
          id: string
          precio: number
          tramo: number
          updated_at: string
        }
        Insert: {
          descripcion: string
          distancia_desde: number
          distancia_hasta: number
          id?: string
          precio?: number
          tramo: number
          updated_at?: string
        }
        Update: {
          descripcion?: string
          distancia_desde?: number
          distancia_hasta?: number
          id?: string
          precio?: number
          tramo?: number
          updated_at?: string
        }
        Relationships: []
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          transferencia_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          insumo_id: string
          transferencia_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          transferencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_stock: {
        Row: {
          created_at: string | null
          despachado_at: string | null
          estado: string | null
          id: string
          jefe_bodega_id: string | null
          notas: string | null
          recibido_at: string | null
          sucursal_destino_id: string
        }
        Insert: {
          created_at?: string | null
          despachado_at?: string | null
          estado?: string | null
          id?: string
          jefe_bodega_id?: string | null
          notas?: string | null
          recibido_at?: string | null
          sucursal_destino_id: string
        }
        Update: {
          created_at?: string | null
          despachado_at?: string | null
          estado?: string | null
          id?: string
          jefe_bodega_id?: string | null
          notas?: string | null
          recibido_at?: string | null
          sucursal_destino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_stock_jefe_bodega_id_fkey"
            columns: ["jefe_bodega_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_stock_sucursal_destino_id_fkey"
            columns: ["sucursal_destino_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_stock_sucursal_destino_id_fkey"
            columns: ["sucursal_destino_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
        ]
      }
      turno_despachadores: {
        Row: {
          activo: boolean | null
          created_at: string | null
          despachador_id: string
          hora_entrada: string | null
          hora_salida: string | null
          id: string
          pagado: boolean | null
          turno_id: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          despachador_id: string
          hora_entrada?: string | null
          hora_salida?: string | null
          id?: string
          pagado?: boolean | null
          turno_id: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          despachador_id?: string
          hora_entrada?: string | null
          hora_salida?: string | null
          id?: string
          pagado?: boolean | null
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turno_despachadores_despachador_id_fkey"
            columns: ["despachador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_despachadores_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos_cierres_admin_auditoria: {
        Row: {
          accion: string
          created_at: string
          efectivo_anterior: number | null
          efectivo_nuevo: number
          efectivo_sistema: number
          id: string
          motivo: string
          sucursal_id: string
          turno_id: string
          usuario_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          efectivo_anterior?: number | null
          efectivo_nuevo: number
          efectivo_sistema: number
          id?: string
          motivo: string
          sucursal_id: string
          turno_id: string
          usuario_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          efectivo_anterior?: number | null
          efectivo_nuevo?: number
          efectivo_sistema?: number
          id?: string
          motivo?: string
          sucursal_id?: string
          turno_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_cierres_admin_auditoria_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_cierres_admin_auditoria_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_cierres_admin_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos: {
        Row: {
          caja_chica_apertura: number
          cerrado_remotamente_por: string | null
          cierre_remoto: boolean
          cierre_remoto_actualizado_at: string | null
          cierre_remoto_motivo: string | null
          closed_at: string | null
          comentario_contador: string | null
          comentario_contador_fecha: string | null
          comentario_contador_usuario_id: string | null
          created_at: string | null
          diferencia_caja: number | null
          efectivo_declarado: number | null
          efectivo_declarado_caja_chica: number | null
          efectivo_declarado_sobre: number | null
          efectivo_sistema: number | null
          estado: Database["public"]["Enums"]["estado_turno"]
          estado_cuadratura: string | null
          fecha_dlitro: string | null
          id: string
          numero_ultimo_pedido: number | null
          observacion_descuadre: string | null
          sucursal_id: string
          tomador_id: string
        }
        Insert: {
          caja_chica_apertura?: number
          cerrado_remotamente_por?: string | null
          cierre_remoto?: boolean
          cierre_remoto_actualizado_at?: string | null
          cierre_remoto_motivo?: string | null
          closed_at?: string | null
          comentario_contador?: string | null
          comentario_contador_fecha?: string | null
          comentario_contador_usuario_id?: string | null
          created_at?: string | null
          diferencia_caja?: number | null
          efectivo_declarado?: number | null
          efectivo_declarado_caja_chica?: number | null
          efectivo_declarado_sobre?: number | null
          efectivo_sistema?: number | null
          estado?: Database["public"]["Enums"]["estado_turno"]
          estado_cuadratura?: string | null
          fecha_dlitro?: string | null
          id?: string
          numero_ultimo_pedido?: number | null
          observacion_descuadre?: string | null
          sucursal_id: string
          tomador_id: string
        }
        Update: {
          caja_chica_apertura?: number
          cerrado_remotamente_por?: string | null
          cierre_remoto?: boolean
          cierre_remoto_actualizado_at?: string | null
          cierre_remoto_motivo?: string | null
          closed_at?: string | null
          comentario_contador?: string | null
          comentario_contador_fecha?: string | null
          comentario_contador_usuario_id?: string | null
          created_at?: string | null
          diferencia_caja?: number | null
          efectivo_declarado?: number | null
          efectivo_declarado_caja_chica?: number | null
          efectivo_declarado_sobre?: number | null
          efectivo_sistema?: number | null
          estado?: Database["public"]["Enums"]["estado_turno"]
          estado_cuadratura?: string | null
          fecha_dlitro?: string | null
          id?: string
          numero_ultimo_pedido?: number | null
          observacion_descuadre?: string | null
          sucursal_id?: string
          tomador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_cerrado_remotamente_por_fkey"
            columns: ["cerrado_remotamente_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_comentario_contador_usuario_id_fkey"
            columns: ["comentario_contador_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
          {
            foreignKeyName: "turnos_tomador_id_fkey"
            columns: ["tomador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean | null
          apellido: string | null
          created_at: string | null
          fecha_nacimiento: string | null
          id: string
          nombre: string
          nombre_completo: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          rut: string | null
          sucursal_id: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          apellido?: string | null
          created_at?: string | null
          fecha_nacimiento?: string | null
          id: string
          nombre: string
          nombre_completo?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          rut?: string | null
          sucursal_id?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          apellido?: string | null
          created_at?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          nombre_completo?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          rut?: string | null
          sucursal_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_dia"
            referencedColumns: ["sucursal_id"]
          },
        ]
      }
    }
    Views: {
      v_stock_bajo_minimo: {
        Row: {
          diferencia: number | null
          insumo: string | null
          stock_actual: number | null
          stock_minimo: number | null
          sucursal: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_ventas_dia: {
        Row: {
          fecha: string | null
          pedidos_cancelados: number | null
          sucursal: string | null
          sucursal_id: string | null
          total_efectivo: number | null
          total_pedidos: number | null
          total_tarjeta: number | null
          total_transferencia: number | null
          total_ventas: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ajustar_costo_despacho_activo: {
        Args: {
          p_costo_cobrado: number
          p_expected_updated_at: string
          p_motivo: string
          p_pedido_id: string
        }
        Returns: Database["public"]["Tables"]["pedidos"]["Row"]
      }
      calcular_costo_despacho: {
        Args: { distancia_km: number }
        Returns: number
      }
      calcular_costo_trago: { Args: { p_producto_id: string }; Returns: number }
      cerrar_turno_remotamente_admin: {
        Args: {
          p_efectivo_declarado: number
          p_motivo: string
          p_turno_id: string
        }
        Returns: Database["public"]["Tables"]["turnos"]["Row"]
      }
      corregir_efectivo_cierre_remoto_admin: {
        Args: {
          p_efectivo_anterior: number
          p_efectivo_declarado: number
          p_motivo: string
          p_turno_id: string
        }
        Returns: Database["public"]["Tables"]["turnos"]["Row"]
      }
      corregir_pedido_entregado: {
        Args: {
          p_metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          p_motivo: string
          p_notas: string
          p_pedido_id: string
        }
        Returns: Database["public"]["Tables"]["pedidos"]["Row"]
      }
      corregir_pagos_pedido_entregado: {
        Args: {
          p_motivo: string
          p_notas: string
          p_pagos: Json
          p_pedido_id: string
        }
        Returns: Database["public"]["Tables"]["pedidos"]["Row"]
      }
      get_dlitro_day: { Args: { ts: string }; Returns: string }
      get_turno_abierto: { Args: { p_sucursal_id: string }; Returns: string }
      get_user_rol: { Args: { _user_id: string }; Returns: string }
      get_user_sucursal: { Args: { _user_id: string }; Returns: string }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      estado_pedido:
        | "tomado"
        | "en_preparacion"
        | "listo"
        | "en_despacho"
        | "entregado"
        | "cancelado"
      estado_turno: "abierto" | "cerrado"
      metodo_pago:
        | "efectivo"
        | "transferencia"
        | "tarjeta"
        | "mixto"
        | "cortesia"
      rol_usuario:
        | "superadmin"
        | "admin"
        | "encargado"
        | "tomador_pedidos"
        | "preparador"
        | "despachador"
        | "jefe_bodega"
        | "contador_rrhh"
        | "logistica"
      tipo_pedido:
        | "despacho"
        | "retiro"
        | "local"
        | "delivery"
        | "uber"
        | "rappi"
        | "puerta"
      tipo_promo:
        | "sabor_del_dia"
        | "jarra_dorada"
        | "cumpleanos"
        | "cupon"
        | "canje"
        | "trabajador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_pedido: [
        "tomado",
        "en_preparacion",
        "listo",
        "en_despacho",
        "entregado",
        "cancelado",
      ],
      estado_turno: ["abierto", "cerrado"],
      metodo_pago: [
        "efectivo",
        "transferencia",
        "tarjeta",
        "mixto",
        "cortesia",
      ],
      rol_usuario: [
        "superadmin",
        "admin",
        "encargado",
        "tomador_pedidos",
        "preparador",
        "despachador",
        "jefe_bodega",
        "contador_rrhh",
        "logistica",
      ],
      tipo_pedido: [
        "despacho",
        "retiro",
        "local",
        "delivery",
        "uber",
        "rappi",
        "puerta",
      ],
      tipo_promo: [
        "sabor_del_dia",
        "jarra_dorada",
        "cumpleanos",
        "cupon",
        "canje",
        "trabajador",
      ],
    },
  },
} as const
