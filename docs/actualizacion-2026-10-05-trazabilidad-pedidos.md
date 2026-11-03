# Actualización del 5 de octubre de 2026: trazabilidad de toma de pedidos

Estado al 4 de octubre: historial privado de pedidos implementado y aplicado en staging, cuenta de dueño habilitada. Ver auditoria-pedidos-validacion-2026-10-04.md. Las demás etapas continúan propuestas.

## Corrección de caja diaria de contabilidad: validada en staging

Reporte del usuario: en el perfil de contabilidad faltan el nombre de sucursal y el resumen de caja por día.

Diagnóstico confirmado en staging el 2 de octubre: `contador_rrhh` no tenía `branches.read` ni `dispatcher_payments.read`. Las políticas existentes ocultaban sucursales ajenas a la asignación del usuario y las liquidaciones de despachadores, necesarias para completar los egresos del resumen. Además, la pantalla ignoraba errores de consultas y convertía datos ausentes en listas vacías.

Se agregó únicamente lectura de sucursales y liquidaciones mediante `supabase/migrations/20261002163235_accountant_cash_daily_read.sql`, aplicada a staging. Se reutilizan las políticas existentes; no se concedió gestión de sucursales, edición de liquidaciones ni nuevos permisos de auditoría. Este arreglo del módulo contable existente no implementa ni amplía acceso al futuro control privado de fugas.

`ContadorPage.tsx` ahora informa fallos al cargar sucursales, cierres y pagos, y bloquea el resumen del detalle si cualquiera de sus consultas falla, con opción de reintentar.

Validación: `supabase/tests/accountant_cash_daily_read.sql` pasó en staging antes de aplicar la corrección, usando permisos temporales, y después de aplicarla. Los datos sintéticos se revirtieron. Comprueba nombres de dos sucursales, suma de liquidaciones, prohibición de modificaciones y aislamiento de un tomador respecto de sucursales ajenas. Compilación staging y revisión de lint del archivo pasaron.

Pendiente: revisión visual con una sesión real de contabilidad. No se modificó producción. El historial privado de pedidos avanzó a staging el 4 de octubre; las demás etapas propuestas siguen pendientes.

## Lista de desarrollo del fin de semana: 3 y 4 de octubre

El usuario solicitó incorporar las cinco mejoras adicionales propuestas a la lista de desarrollo de este fin de semana. Los siguientes bloques forman el alcance de trabajo recopilado; las prioridades indican orden de implementación, no garantizan entrega de todo el alcance el lunes 5 de octubre. Validar en staging y acordar la salida a producción por separado.

### Prioridad 1: datos confiables y control de pérdidas

- [x] Historial protegido de pedidos, promociones, pagos y correcciones, con autor, hora, valores anteriores y nuevos y estado del pedido al aplicar la promoción.
- [ ] Cuadratura de jarros separando declaración, recogida, recepción y conteo físico; preservar evidencia y evitar duplicaciones por reintentos.
- [ ] Acceso a resultados de control exclusivamente para superadmin y dueño de DLITRO; conteos operativos sin mostrar cantidad esperada ni diferencias.
- [ ] Cierre diario con cobertura: identificar sucursales que registraron ventas, gastos y conteos, datos pendientes y desde cuándo hay información suficiente. No presentar faltantes como cero ni revelar diferencias a trabajadores.
- [ ] Seguimiento de alertas: pendiente, revisada o resuelta, con responsable de revisión, fecha, explicación y respaldo. Reservado al dueño de DLITRO y superadmin; resolver no borra el evento ni demuestra que no existió la diferencia. Definir permisos específicos de revisión sin otorgar edición de operaciones.

### Prioridad 2: logística y franquicias

- [ ] Trazabilidad logística de solicitud, preparación, salida, transporte y recepción, incluyendo entregas parciales, pendientes, daños y responsables.
- [ ] Estadísticas de despachadores: pedidos, canjes, jarros, remuneración, pagos y pendientes, respetando acceso operativo y acceso privado a auditoría.
- [ ] Compras y deudas de franquicias: pedidos de insumos, entregas, devoluciones, pagos, vencimientos y saldos. No duplicar pagos en reintentos; conciliar cada pago con su operación y preservar correcciones.
- [ ] Vista del dueño de franquicia limitada a su negocio y sus sucursales autorizadas.
- [ ] Creación de cuentas por franquiciado únicamente de tomador de pedidos y despachador, con autorización en servidor y trazabilidad.

### Prioridad 3: costos y resultados para los dueños

- [ ] Registro de costo de preparación de mojitos y costos de insumos con unidades, vigencia e historial.
- [ ] Sueldos por sucursal, gastos operativos y administrativos; distinguir costos del período y movimientos de dinero.
- [ ] Costo de promociones: productos bonificados, costo asociado, descuento concedido y proporción de ventas por promoción, sucursal y período. Definir denominadores; no sumar costo del producto y descuento como si ambos fueran el mismo gasto. El costo es consumo y el descuento reduce ingresos.
- [ ] Resultados separados de cada franquicia y de DLITRO con esa franquicia, incluyendo detalle por venta de suministro y costos logísticos atribuibles.
- [ ] Comparación de rentabilidad entre sucursales por períodos equivalentes, con desglose de ingredientes, personal, promociones y logística. Mostrar cobertura y separar sucursales propias/franquicias; no inventar rankings de utilidad cuando falten costos.
- [ ] Vista del dueño de DLITRO con cifras explicables y acceso a la evidencia autorizada.

### Validación transversal

- [ ] Pruebas de acceso permitido y prohibido, aislamiento de franquicias y ausencia de datos privados en respuestas operativas.
- [ ] Pruebas de concurrencia, reintentos, fallos parciales, correcciones y conservación del historial en los flujos críticos.
- [ ] Validación de períodos, unidades y cálculos, sin duplicar ventas, costos, pagos o jarros.
- [ ] Revisión manual en staging de los flujos existentes y nuevas vistas antes de preparar la actualización.

Estos puntos están incorporados al requerimiento. Las casillas pendientes reflejan las etapas que aún no están implementadas; el historial ya está aplicado en staging.

## Decisión vigente de acceso: superadmin y dueño

El usuario autorizó expresamente que el dueño vea las cifras del negocio y también la auditoría de posibles fugas. Esta decisión sustituye la exclusividad de superadmin documentada anteriormente en este archivo. Las menciones posteriores de exclusividad se conservan como contexto del levantamiento y deben interpretarse con esta actualización.

Los resultados del nuevo control estarán disponibles solo para superadmin y dueño autorizado. Tomadores, despachadores, administradores de sucursal, encargados y demás roles no tendrán acceso a diferencias, cruces ni alertas de investigación. Implementar la excepción del dueño con autorización confiable en el servidor, sin otorgarle automáticamente todos los privilegios del superadmin.

La auditoría del dueño será de lectura. El usuario amplió el requerimiento para permitirle registrar valores de productos, costos y gastos en su propia vista; definir esos permisos específicos sin conceder edición general de operaciones o administración de usuarios. Validar expresamente acceso permitido de dueño/superadmin y acceso prohibido de todos los demás roles mediante API, exportaciones y suscripciones.

## Ampliación confirmada: costos y rentabilidad del dueño

### Dos resultados por franquicia y vista para el franquiciado

El usuario confirmó que quiere evaluar ambos lados del modelo: cuánto gana cada franquicia con su operación y cuánto gana el dueño de DLITRO con esa franquicia. Indicó que actualmente no existe el registro completo necesario y que se exigirá utilizar el sistema para obtenerlo. También solicitó una vista para el dueño de cada franquicia.

- Resultado de la franquicia: ventas netas menos costo de productos vendidos, personal, arriendo, servicios y demás gastos del período. Identificar datos faltantes y mostrar resultado parcial/estimado mientras no exista cobertura completa.
- Resultado de DLITRO con esa franquicia: ingresos por suministros y cargos comerciales confirmados menos costo de mercadería y distribución atribuible, sin atribuir a DLITRO las ventas minoristas de la franquicia.
- El dueño de DLITRO consulta ambos resultados, con detalles y cobertura por franquicia. Las compras de la franquicia a DLITRO deben corresponder a ventas de suministro de DLITRO y reconciliarse por operación, sin duplicar ingresos o costos dentro de cada resultado.
- La vista del dueño de franquicia muestra únicamente sus sucursales autorizadas: ventas, cobros, costos propios, personal, gastos, compras a DLITRO, pagos/deudas y resultado. Propuesta adicional: pendientes operativos y evolución por período, con detalle que explique cada cifra.
- No conceder al dueño de franquicia acceso a otras franquicias, costos internos o márgenes de DLITRO ni a la auditoría de posibles fugas reservada al superadmin y dueño de DLITRO. Cualquier ampliación de esos permisos requiere una decisión explícita del usuario.
- Diferenciar en el modelo de autorización al dueño de DLITRO del dueño de franquicia. La asociación a sucursales debe comprobarse en servidor, incluyendo franquiciados con varias sucursales y llamadas directas a la API.
- Definir cómo se registrarán ventas, costos, personal y gastos obligatorios; quién puede ingresarlos/corregirlos; frecuencia de cierre; respaldo y control de cobertura. La obligación de usar el sistema no garantiza por sí sola integridad o exactitud del dato.
- No reconstruir ventas o gastos históricos ausentes como ceros. Identificar desde qué fecha existe registro suficiente y mantener el historial de correcciones.

Esta ampliación confirma la intención de uso obligatorio y ambas vistas. No se implementaron bloqueos operativos, nuevos roles ni permisos. Acordar la transición antes de impedir operaciones o cierres por falta de registro.

### Cuentas creadas por el dueño de franquicia

Requerimiento confirmado: el dueño de franquicia podrá crear cuentas para su negocio únicamente con roles `tomador_pedidos` y `despachador`. No autoriza crear preparadores, administradores, dueños, superadmins u otros roles.

- Limitar la asignación a sucursales de la franquicia que el dueño esté autorizado a administrar. No aceptar la propiedad o el alcance declarado por el cliente sin comprobarlo en servidor.
- Reutilizar, tras revisar, el flujo existente `supabase/functions/crear-usuario/index.ts` y la interfaz de usuarios; no exponer credenciales privilegiadas ni reutilizar acceso administrativo general para habilitar esta capacidad.
- Aplicar una lista cerrada de los dos roles permitidos en el servidor, incluyendo validación del payload y de los datos de asociación a sucursal. Probar solicitudes manipuladas que intenten crear roles superiores o cuentas en otra franquicia.
- Registrar quién creó la cuenta, fecha y sucursal, con trazabilidad protegida. Cada trabajador utiliza su propia cuenta para atribuir las acciones.
- No conceder a las nuevas cuentas acceso a costos sensibles, sueldos ajenos, resultados financieros, auditoría de fugas o reportes de otros negocios.
- Validar fallos parciales entre autenticación y perfil, correos existentes y reintentos, sin tomar control de cuentas ajenas. Mantener el mecanismo de recuperación compatible con el flujo existente.
- La creación no implica permiso general para modificar roles, elevar privilegios, reasignar cuentas ajenas, eliminar usuarios o consultar sus credenciales. Definir posteriormente si se necesita desactivación de cuentas propias conservando el historial.

La búsqueda inicial confirma un flujo existente de creación de usuarios y los nombres de los roles operativos; no se modificó su implementación ni su autorización.

El usuario solicita registrar cuánto vale cada mojito y calcular gastos y ganancias; conocer sueldos por sucursal, gastos administrativos, compras y rentabilidad de cada franquicia, rentabilidad de cada operación de venta de insumos a franquicias y costo de cada insumo. El levantamiento permanece abierto a otros requerimientos.

### Productos e insumos

- Confirmado por el usuario: «cuánto vale cada mojito» significa únicamente costo de preparación. El dueño podrá registrar ese costo; este requerimiento no autoriza modificar precios de venta. Usar los precios y descuentos reales de los pedidos para calcular ingresos.
- Registrar costo por insumo, unidad y presentación, proveedor y fecha de vigencia; convertir cajas, botellas, unidades y mililitros con equivalencias explícitas.
- Revisar las recetas existentes en `src/pages/admin/RecetasPage.tsx` y el catálogo en `src/pages/bodega/InsumosPage.tsx` para reutilizar datos y evitar un segundo catálogo.
- Propuesta: costo del mojito a partir de la receta, ingredientes y envase/consumibles aplicables. Separar costo calculado de costo estimado ingresado manualmente y mostrar su cobertura.
- Calcular contribución por producto usando venta neta de descuentos menos costo de unidades vendidas. Los productos gratis también consumen insumos; no tratarlos como costo cero. Revisar el tratamiento de retornables, extras y mermas para evitar duplicaciones.
- Conservar el costo aplicado a cada operación o su versión histórica. Cambiar el costo actual no debe reescribir automáticamente la rentabilidad de períodos anteriores.

### Sueldos y gastos

- Mostrar costo de personal por sucursal y período, con desglose por trabajador/categoría y conceptos autorizados: sueldo, turnos, bonos, pagos de despachadores y otros costos laborales registrados.
- Separar gasto del período de pago efectivamente realizado y montos pendientes. Evitar contar la misma liquidación como sueldo y nuevamente como egreso independiente.
- Registrar y mostrar gastos administrativos por categoría, fecha y respaldo disponible. Separar administración central de gastos directos de sucursal.
- Si se distribuyen gastos centrales entre sucursales, acordar y mostrar el criterio. No repartirlos arbitrariamente ni cargar el total a cada sucursal.
- Distinguir compras de insumos (salida de dinero y entrada de inventario) de consumo/costo de venta. No descontar ambas veces la misma mercadería al calcular el resultado.

### Franquicias

- Mostrar cuánto compra cada franquicia por período, operación e insumo, distinguiendo importes facturados, cobrados y pendientes.
- Para cada venta de insumos a una franquicia: cantidades, costo histórico, precio, descuentos, ingreso neto, costo de mercadería y utilidad bruta. Registrar por separado transporte y otros costos atribuibles para calcular contribución después de logística cuando exista cobertura.
- Consolidar por franquicia sin mezclar ventas de suministro con transferencias internas ni con las ventas minoristas de esa franquicia.
- Si existen cuotas, licencias o regalías, incorporarlas solo después de confirmar su regla y fuente. Las referencias de precios comerciales del proyecto no equivalen a ingresos cobrados.
- Mostrar margen sobre ingreso y markup sobre costo con etiquetas distintas, y valores no calculables cuando el denominador sea cero.

### Definiciones y presentación

`Utilidad bruta de suministro = ingreso neto de venta de insumos - costo de los insumos vendidos`.

`Resultado operativo con cobertura suficiente = ingresos netos - costos de venta - personal - otros gastos operativos - administración atribuida`.

Definir período, base de impuestos y tratamiento de devoluciones/cancelaciones antes de implementar. Mostrar resultado estimado o parcial cuando falten datos, sin presentarlo como utilidad neta completa. Separar caja (cobros/pagos) de rentabilidad (ingresos/costos/gastos del período).

Todos los cambios de costos, gastos y valores deben registrar autor, fecha, vigencia e historial. La auditoría continúa protegida de edición. Los permisos de costos, sueldos y resultados sensibles deben comprobarse en servidor y no exponerse a roles operativos mediante consultas compartidas.

### Pendientes específicos

Costo de preparación confirmado. Precisar fuentes actuales de compras y sueldos, regla de valoración de inventario, cargos administrativos compartidos y alcance de ingresos de franquicias. Esta ampliación requiere priorización: la fecha del lunes no confirma entrega de todo el módulo financiero.

## Restricción confirmada: auditoría exclusiva del superadmin

El usuario exige que la información de control recopilada para este requerimiento, sus cruces, estadísticas, alertas y diferencias sean visibles únicamente al superadmin. No conceder acceso por ser administrador de sucursal, encargado, tomador, despachador o contador. Esta restricción sustituye las propuestas anteriores de consulta administrativa general para este nuevo control.

- Los trabajadores ingresan únicamente los datos necesarios para operar: pedidos, promociones, devoluciones y conteos físicos. No reciben existencia esperada, diferencia calculada, indicadores de sospecha, comparaciones con otros trabajadores ni resultados del control. Los conteos deben realizarse sin mostrar el número objetivo.
- Mantener la información operativa necesaria para cobrar y entregar pedidos; distinguirla de los reportes de auditoría exclusivos del superadmin. No ampliar los datos que reciben las pantallas operativas con motivo de esta funcionalidad.
- Calcular y consultar los resultados en el servidor. No enviar datos de auditoría al navegador de otros roles para después ocultarlos. Aplicar restricciones en tablas, vistas, funciones/RPC, exportaciones, suscripciones y cualquier integración o asistente que consulte estos datos.
- Comprobar el rol contra la fuente de autorización confiable existente; no aceptar un rol indicado por el cliente ni metadatos editables por el usuario.
- Conservar cada envío y corrección con autor y hora del servidor. Una corrección legítima no sobrescribe el conteo ni la declaración original. Definir los límites de modificación y el procedimiento de corrección tras el cierre antes de implementar.
- Evitar revelar la diferencia indirectamente mediante mensajes de error, notificaciones, impresiones, respuestas de guardado o solicitudes de corrección que indiquen el valor esperado. Confirmar recepción de datos sin informar si cuadran.
- Revisar políticas de lectura existentes: `orders.audit.read` se concede actualmente a varios roles en la matriz del repositorio. Reutilizar esa autorización sin restringirla no satisface este requerimiento. El panel existente también está dentro de rutas compartidas por admin y superadmin y tiene entradas para ambos en el menú.
- Inventariar reportes y datos derivados actuales que puedan exponer las nuevas diferencias. Separar este control de las consultas operativas existentes y evaluar cada cambio de permisos para evitar romper operaciones ajenas al requerimiento.

Pruebas obligatorias: superadmin puede consultar el detalle; todos los demás roles reciben denegación o ausencia de filas según la interfaz, incluso mediante llamadas directas a la API, enlaces, exportaciones y suscripciones. Verificar que sus respuestas operativas no contengan campos del nuevo control y que una corrección conserve evidencia original.

Esta restricción está documentada; todavía no se han aplicado cambios de permisos en la aplicación ni en la base de datos.

## Requerimiento prioritario confirmado: promoción de cuatro jarros

El usuario reporta posibles declaraciones ficticias de la promoción de cuatro jarros por un producto gratis, con posible apropiación del dinero cobrado. Solicita cuadratura de jarros, identificación del momento en que el tomador registra la promoción y estadísticas de despachadores. Este es uno de los requerimientos de la actualización, no el alcance completo.

### Información que debe mostrar la plataforma

- Quién declaró, agregó, cambió o retiró la promoción y cuándo lo hizo.
- Si estaba presente en la creación del pedido o se agregó después; conservar el estado del pedido al momento de cada acción para distinguir preparación, despacho y entrega. Los cambios del formulario antes de guardar no tienen hoy un historial persistente.
- Jarros prometidos, jarros declarados como recibidos y jarros físicamente verificados, con responsables y horas separados.
- Cantidad de canjes de cuatro jarros, productos bonificados y valor descontado, separados de otros descuentos y promociones.
- Precio y pago antes y después de aplicar o retirar la promoción.
- Despachador asignado en cada momento y quién recibió los jarros en la sucursal. No atribuir automáticamente la recepción al despachador asignado.

### Evidencia adicional del código

- `NuevoPedidoTab.tsx` calcula un producto gratis por cada cuatro jarros y un descuento de CLP 1.000 por cada jarro sobrante. La regla de sobrantes es comportamiento existente y debe confirmarse antes de modificarla.
- En la creación se asigna `jarrosNum` tanto a `jarros_prometidos` como a `jarros_entregados`. Por ello, ese campo no demuestra por sí solo una recepción física.
- `MisPedidosTab.tsx` permite confirmar, reducir o agregar jarros durante la entrega y recalcular el descuento. La suma al stock se realiza aparte, desde el cliente.
- Existe `ConteoJarrosCard.tsx` con cajas con/sin sticker, jarros sueltos y rotos. Su texto describe el módulo como opcional. Debe revisarse su persistencia y unidad por caja antes de convertirlo en una cuadratura exigible.
- Existen `DespachadoresTab.tsx`, `PedidosDespachadorModal.tsx` y `PagarDespachadorCard.tsx` para pedidos y liquidación. El detalle de pedidos consultado en ese modal no incluye actualmente las cantidades de jarros o las promociones.

### Control propuesto de recepción y cuadratura

Separar declaración del tomador, recogida del despachador y recepción física de la sucursal. Una declaración no debe confirmarse automáticamente como recepción verificada. Definir quién verifica; idealmente una persona diferente de quien declaró el canje.

Cuadratura por sucursal y turno, expresada en unidades de jarro:

`Existencia esperada al cierre = existencia física inicial + devoluciones verificadas + otras entradas verificadas - salidas - bajas documentadas`.

`Diferencia = existencia física final - existencia esperada al cierre`.

Desglosar ventas con envase, regalos con envase, traslados, roturas y demás movimientos pertinentes después de revisar cómo afectan hoy al inventario. Separar jarros en tránsito o en poder de despachadores: recogido no significa recibido en sucursal. Evitar contar dos veces una devolución.

La confirmación debe ser transaccional e idempotente: repetir una solicitud no debe sumar nuevamente los jarros ni el descuento. Conservar correcciones con motivo y autor, sin reemplazar la evidencia original.

### Estadísticas solicitadas por despachador

- Pedidos asignados, entregados y cancelados, con detalle por turno y período.
- Pedidos con promoción y cantidad de canjes, distinguiendo una promoción declarada de una devolución verificada.
- Jarros prometidos, recogidos, recibidos en sucursal y pendientes/diferencias.
- Remuneración desglosada: base, despachos, carreras manuales, bonos, descuentos por préstamos, total liquidado y pago efectivamente registrado. No confundir monto vendido con ganancia del despachador.
- Conservar reasignaciones para no cargar toda la responsabilidad al despachador que figure al final.

### Alertas y pruebas adicionales

Mostrar para revisión promociones agregadas después de crear el pedido, descuentos modificados después de registrar el cobro, promociones sin recepción verificada y diferencias físicas. Son señales para revisar, no pruebas automáticas de robo.

Probar: cuatro jarros declarados y cero recibidos; promo agregada al entregar; devolución parcial; dos canjes en un pedido; sobrantes; cancelación; reasignación; recepción posterior al cierre; reintento de confirmación; corrección de conteo; concurrencia; acceso fuera de sucursal. No generar registros históricos ficticios de recepción o autor.

### Aclaraciones operativas necesarias

Confirmar quién recoge y quién cuenta físicamente los jarros, si el receptor usa una cuenta propia y si existe comprobante independiente. Confirmar cuántos jarros contiene cada caja y qué significa para el usuario una promo «demostrada»: recogida declarada, recepción física verificada o evidencia adicional.

## Objetivo

Permitir exclusivamente al superadmin consultar las acciones operativas de cada persona que toma pedidos: qué hizo, cuándo, sobre qué pedido y qué cambió. Diferenciar siempre al tomador original del autor de cada acción posterior.

## Ampliación confirmada: mejorar logística

El usuario solicita mejorar también el proceso de logística. Los problemas operativos concretos y su prioridad para el lunes están pendientes de precisar; no considerar confirmado todo el alcance propuesto a continuación.

La revisión inicial encuentra módulos existentes para solicitudes de sucursales, bodega central, choferes, inventarios e historial. `src/lib/logistica.ts` define estados borrador, enviado, asignado, en camino y entregado. `LogisticaPage.tsx` y `PedidosSucursalesPage.tsx` distinguen cantidades solicitadas y enviadas. Es necesario revisar las funciones y triggers vigentes antes de concluir cómo se registra la recepción o se mueve el stock.

Propuesta de revisión por etapas:

1. Solicitud: autor, sucursal, productos, unidad y cantidad requerida.
2. Preparación: cantidad preparada, responsable, sustituciones o pendientes.
3. Salida: cantidad que sale realmente, bodega origen, chofer y fecha.
4. Recepción: cantidad físicamente recibida, receptor, hora, entregas parciales, daños y pendientes. Conservar la declaración original sin reemplazarla por la cantidad esperada.
5. Cierre: conciliación de movimientos y cantidades, evitando dobles descuentos o entradas por reintentos y registrando correcciones.

Distinguir stock en bodega, en tránsito y recibido. Un estado «entregado» no constituye por sí solo prueba de una recepción física. Conservar autor y hora en cada etapa y revisar concurrencia, fallos parciales y consistencia de unidades/cajas.

Aplicar al nuevo control logístico la restricción confirmada: cruces, diferencias calculadas, alertas y auditoría exclusivamente para superadmin. Los roles operativos conservan las instrucciones y datos necesarios para preparar, transportar y registrar recepción; no reciben los resultados del control ni números objetivo en formularios de conteo físico.

Para franquicias, diferenciar una transferencia interna de una venta de insumos: revisar costo, precio, cobro y documentación sin asumir las reglas de sucursales propias.

Antes de implementar, precisar dónde falla hoy el proceso y un ejemplo real. No se modificó todavía la funcionalidad logística ni su autorización.

## Ampliación confirmada: vista para el dueño

El usuario solicita una nueva vista para el dueño de la empresa (su primo), como mejora proactiva para entender los números y detectar problemas operativos. La intención está confirmada; métricas, alcance de sucursales y permisos específicos siguen por definir.

Propuesta inicial de una vista de lectura, clara y con acceso al detalle que respalda cada cifra:

- Ventas del período, pedidos completados, ticket promedio, descuentos y cancelaciones; definir qué estados se incluyen y separar ventas de cobros.
- Cobros por método, gastos registrados y pagos a despachadores. No denominar utilidad a ventas menos los gastos parciales disponibles.
- Comparación por sucursal y período equivalente, separando sucursales propias y franquicias según el modelo comercial.
- Problemas operativos verificables: pedidos pendientes o demorados, entregas logísticas pendientes y disponibilidad de insumos. Evitar clasificar una demora o una diferencia como robo.
- Mostrar fecha de actualización, período, definiciones, datos faltantes y vínculo al detalle autorizado. Un dato ausente no equivale a cero.
- Ganancia o margen únicamente cuando exista costo suficiente y una definición validada; explicar cobertura cuando falten costos.

Ya existen `AdminDashboardPage.tsx` y `EncargadoDashboard.tsx`. Antes de crear componentes o consultas paralelas, revisar y reutilizar sus elementos. La búsqueda inicial no identificó una ruta específica para dueño; revisar el modelo completo de permisos antes de introducir un rol.

El usuario confirmó acceso del dueño a la auditoría de posibles fugas, además de las cifras del negocio. La nueva vista no concede automáticamente permisos para editar pedidos, inventarios, caja, usuarios o promociones.

Acceso del dueño a la auditoría confirmado. No se implementó todavía esta vista ni se amplió ningún permiso.

## Evidencia revisada del flujo de pedidos

- `src/pages/turno/tabs/NuevoPedidoTab.tsx`: la creación guarda `tomador_id`. Pedido, productos y pagos se escriben en solicitudes separadas.
- `src/pages/turno/tabs/MisPedidosTab.tsx`: hay actualizaciones de estados, despachador, pagos, datos del cliente y productos. La edición de productos agrega un resumen a las notas; eso no equivale a un historial completo con autor y valores anteriores.
- `src/pages/admin/PedidosAdminPage.tsx`: algunas ediciones escriben `log_cambios_pedido` desde el cliente después de modificar los datos. Si ese registro falla, se emite una advertencia y la operación puede mostrarse como exitosa.
- `src/pages/admin/AuditoriaDespachosPage.tsx`: existe un panel reutilizable, pero la consulta de cambios de pedidos filtra `pedido_corregido_post_cierre` y limita el resultado a 200 registros.
- Las migraciones contienen auditoría de correcciones posteriores a la entrega, ajustes de despacho y devolución automática a preparación. No constituyen por sí solas cobertura de todas las acciones durante la toma de pedidos.
- La política de lectura de `log_cambios_pedido` exige `orders.audit.read` y alcance del pedido. La migración `20260821123829_restore_scoped_order_audit_insert.sql` permite insertar desde el cliente dentro del alcance y con el usuario autenticado como autor. Esa comprobación no demuestra que el cambio descrito realmente ocurrió.

Estos hallazgos corresponden al repositorio local; no se comprobó el estado aplicado de la base remota.

## Alcance inicial propuesto

1. Creación del pedido con tomador, sucursal, turno y hora.
2. Productos agregados, retirados o modificados: producto, cantidad, precio y notas anteriores y nuevas.
3. Cambios de cliente, dirección, modalidad de entrega y despachador.
4. Cambios de estado, cancelaciones y sus motivos cuando corresponda.
5. Registro y corrección de pagos, importes y métodos; ajustes de despacho.
6. Cambios de descuentos o promociones, si el flujo existente los permite, después de identificar su implementación.

Cada evento debe contener autor real, fecha del servidor, pedido, sucursal, turno, acción y valores anteriores/nuevos relevantes. Los eventos automáticos deben identificarse como tales; no atribuir una integración o tarea del sistema al tomador original.

## Consulta en la plataforma

Extender el panel existente con filtros por persona, sucursal, turno, fechas, pedido y tipo de acción. Mostrar una cronología por pedido y un detalle por persona. Aplicar los filtros antes de paginar, para evitar presentar los últimos 200 registros como si fueran todo el historial.

Los resúmenes deben distinguir pedidos creados por una persona de modificaciones realizadas por esa persona en pedidos de otros. No sumar cada campo cambiado como un pedido adicional ni como una venta adicional. Un pedido cancelado debe identificarse por separado.

## Implementación y orden de trabajo

1. Inventariar las rutas de escritura, incluidos administración, turno, cocina e integraciones, y comprobar las migraciones aplicadas en staging.
2. Ampliar la auditoría existente desde la base de datos para registrar los cambios confirmados en la misma transacción. Revisar registros existentes para evitar duplicados y preservar las correcciones posteriores al cierre.
3. Revisar las inserciones de historial desde el cliente y retirar progresivamente esa dependencia una vez que exista cobertura equivalente en el servidor.
4. Incorporar filtros, paginación y presentación legible en el panel existente, con estados de carga, error y ausencia de resultados.
5. Validar en staging antes de preparar la actualización de producción.

No cambiar reglas de inventario, caja o estados para implementar la auditoría. La atomicidad actual de la creación y edición de pedidos requiere evaluación específica; agregar historial no convierte por sí solo las solicitudes separadas en una operación atómica.

## Criterios de aceptación

- Persona A crea un pedido y persona B lo modifica: ambos aparecen con su acción correcta.
- Una modificación de cantidad o precio muestra los valores anteriores y nuevos.
- Crear, modificar, cancelar y registrar/corregir pagos tienen cobertura explícita.
- Los cambios de estado automáticos y las correcciones post-cierre no se duplican.
- Guardar sin cambios no genera actividad ficticia.
- Una operación revertida no deja un evento que afirme que el cambio se confirmó.
- El usuario no puede falsificar autor, editar ni eliminar el historial mediante la API.
- Un usuario sin permiso o fuera de la sucursal autorizada no puede consultar la auditoría.
- Se prueban sucursales propias y franquicias sin ampliar su alcance de acceso.
- Los filtros funcionan con más de 200 eventos y la pantalla informa la paginación.
- Se verifica el ciclo existente de preparación, despacho, entrega, cancelación y correcciones de pagos.
- El historial evita credenciales y datos personales innecesarios.

## Decisiones pendientes

- Lista del fin de semana confirmada; acordar el corte de entrega del lunes según avance y validación.
- Consulta del nuevo control confirmada: superadmin y dueño de DLITRO, con autorización que deberá aplicarse en el servidor. No incluye dueños de franquicia.
- Confirmar si se requieren tiempos de atención. El tiempo entre creación y entrega no es tiempo de toma del pedido; este último requiere definir e instrumentar inicio y fin.
- El historial anterior debe mostrarse con su cobertura real. No reconstruir autores ni valores ausentes como si hubieran sido registrados.

## Verificaciones realizadas

Se revisaron las instrucciones del proyecto, el estado de Git, los flujos citados y las migraciones relacionadas. `npm run verify:staging-env` pasó y confirmó el entorno staging documentado en `STAGING.md`.

No se modificó código funcional ni se aplicaron migraciones o cambios remotos. Se preservaron los cambios locales existentes. La fecha es un objetivo de entrega, sujeto al alcance final y a la validación.
