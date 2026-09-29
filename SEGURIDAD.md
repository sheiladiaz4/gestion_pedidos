# RUMA CRM · Auditoría de seguridad

**Arquitectura:** la pantalla (index.html, app.js) está en GitHub Pages, que es público. Los datos están en tu Google Sheets y las fotos en tu Drive, los dos privados. En el medio hay una API en Apps Script que se ejecuta con tu cuenta y solo responde a quien tenga una sesión válida.

**Principio:** en GitHub no hay ningún secreto. Aunque alguien lea todo el código, sin usuario y contraseña no puede leer ni modificar nada.

## Amenazas y cómo están cubiertas

| # | Riesgo | Protección | Probado |
|---|---|---|---|
| 1 | Alguien entra al link de la app | Pide usuario y contraseña. Sin sesión, la API no devuelve ningún dato. | ✔ |
| 2 | Robo de contraseñas guardadas | No se guardan: se guarda solo un hash PBKDF2-SHA256 con 3000 iteraciones y sal aleatoria por usuario, en las *Propiedades del script*. No quedan en la planilla, en GitHub ni en el navegador. | ✔ |
| 3 | Probar contraseñas a lo bruto | Después de 8 intentos fallidos en 15 minutos se bloquea el ingreso por 15 minutos, hay 1 segundo de espera por intento fallido y te llega un **mail de alerta**. | ✔ |
| 4 | Averiguar qué usuarios existen | Si falla el usuario o la contraseña, el mensaje y el tiempo de respuesta son los mismos. | ✔ |
| 5 | Inventar o adivinar una sesión | El token es aleatorio (244 bits). El servidor guarda solo su hash. La sesión vence a las 6 h sin uso. | ✔ |
| 6 | Robo de un celular o notebook con la sesión abierta | Por defecto, la sesión se borra al cerrar la pestaña. "Mantener sesión" es opcional. En la planilla está el menú **Cerrar todas las sesiones**, que corta el acceso en todos los dispositivos. | ✔ |
| 7 | Llamar funciones internas de la API | Solo se aceptan las acciones de una lista cerrada. Nombres como `constructor` o `__proto__` se rechazan. | ✔ |
| 8 | Falsear datos calculados (pagado, saldo, ganancia, carpeta) | El servidor ignora esos campos y los recalcula. | ✔ |
| 9 | Inyectar fórmulas en Sheets (`=IMPORTXML(...)` para sacar datos) | Todo texto que empieza con `= + - @` se guarda como texto plano. | ✔ |
| 10 | XSS: meter código en un nombre o nota para que se ejecute en la app | Todo se muestra escapado. Además, la CSP no permite scripts de otros orígenes ni scripts escritos dentro del HTML. | ✔ |
| 11 | Fotos maliciosas (por ejemplo un SVG con código) | Solo se aceptan JPG, PNG y WEBP, hasta ~10 MB. Las miniaturas que no tienen el formato correcto se descartan. | ✔ |
| 12 | Referencias a registros inexistentes, IDs raros, fechas o valores inválidos | Se validan los IDs, las fechas, los montos, las etapas y los vínculos. | ✔ |
| 13 | Solicitudes gigantes | Se rechazan si pasan los 15 MB. Los textos tienen un máximo de 5000 caracteres. | ✔ |
| 14 | Que un error revele detalles internos | Hacia afuera se devuelven mensajes genéricos. El detalle queda solo en el registro de Apps Script. | ✔ |
| 15 | Meter la app dentro de otra página (clickjacking) | La app detecta si la abrieron dentro de otra página y se sale a una pestaña propia. | ✔ |
| 16 | Filtrar el link de la app a otros sitios | `referrer: no-referrer` y links externos con `noopener`. | ✔ |
| 17 | Auditoría de accesos | La hoja **Accesos** registra cada ingreso: fecha, usuario y si fue OK o FALLIDO. | ✔ |

## Riesgos que quedan (y qué hacer)

1. **Tu cuenta de Google y tu cuenta de GitHub son la llave maestra.** Activá la **verificación en 2 pasos** en las dos. Es lo más importante de toda esta lista.
2. **Bloqueo por ataques:** alguien que conozca el link puede provocar el bloqueo de 15 minutos a propósito. No puede entrar, pero te deja 15 minutos sin acceso. Si pasa seguido, se puede agregar un segundo factor.
3. **Contraseñas:** tienen un mínimo de 10 caracteres con letras y números. Usá una que no uses en ningún otro lado. Un gestor de contraseñas ayuda.
4. **Links de fotos en Drive:** son privados. Para verlas hay que estar logueada con tu Google, o con la cuenta a la que le compartas la carpeta.
5. **Límites de Google:** si alguien manda muchísimas solicitudes, podría gastar la cuota diaria de Apps Script. No expone datos.
6. **Personas con acceso a la planilla:** quien sea editor de la planilla ve todos los datos y puede editar el script. Compartila solo con quien corresponda.

## Buenas prácticas de uso
- No compartas usuarios: creá uno por persona desde el menú **RUMA CRM → Crear o cambiar usuario**.
- Si alguien deja el equipo: **Eliminar usuario** y después **Cerrar todas las sesiones**.
- Si te llega el mail de "Ingreso bloqueado" y no fuiste vos: cambiá la contraseña y cerrá todas las sesiones.
- Mirá la hoja **Accesos** cada tanto.
