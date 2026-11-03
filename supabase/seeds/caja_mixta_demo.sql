-- Only staging suscxwjloggmbsqdlgpj. User-requested cash display sample.
begin;
do $$ begin
 assert exists(select 1 from public.turnos where id='d4300000-0000-4000-8000-000000000001' and sucursal_id='d4100000-0000-4000-8000-000000000001'), 'Missing demo shift';
 assert not exists(select 1 from public.pedidos where id='d4600000-0000-4000-8000-000000000001'), 'Mixed payment demo already exists';
end $$;
insert into public.pedidos(id,sucursal_id,turno_id,tomador_id,cliente_nombre,tipo,estado,subtotal,total,descuento,costo_despacho,metodo_pago,pago_registrado,origen,notas)
values('d4600000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','DEMO Pago mixto','retiro','tomado',20000,20000,0,0,'mixto',true,'demo','[DEMO CAJA MIXTA 20261004] Pago ficticio para visualizar el desglose. No representa dinero recibido ni movimiento físico.');
insert into public.pagos_turno(id,turno_id,pedido_id,metodo,monto) values
('d4700000-0000-4000-8000-000000000001','d4300000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000001','efectivo',12000),
('d4700000-0000-4000-8000-000000000002','d4300000-0000-4000-8000-000000000001','d4600000-0000-4000-8000-000000000001','transferencia',8000);
update public.pedidos set estado='entregado' where id='d4600000-0000-4000-8000-000000000001';
commit;
