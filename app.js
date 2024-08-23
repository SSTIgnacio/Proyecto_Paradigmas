// Importar dependencias necesarias
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot'); // Importa funciones para crear el bot y flujos
require("dotenv").config(); // Cargar variables de entorno desde el archivo .env

const QRPortalWeb = require('@bot-whatsapp/portal'); // Importar módulo para generar el QR de acceso web
const BaileysProvider = require('@bot-whatsapp/provider/baileys'); // Proveedor para conectar con WhatsApp usando Baileys
const MockAdapter = require('@bot-whatsapp/database/mock'); // Adaptador de base de datos mock para pruebas
const path = require("path"); // Módulo para trabajar con rutas de archivos
const fs = require("fs"); // Módulo para operaciones de sistema de archivos
const { v4: uuidv4 } = require('uuid'); // Módulo para generar identificadores únicos
const chat = require("./chatGPT"); // Importar módulo para interactuar con la API de OpenAI

// Leer contenido de archivos de texto que contienen respuestas y mensajes
const opcionesPath = path.join(__dirname, "mensajes", "opciones.txt"); // Ruta al archivo de opciones
const opciones = fs.readFileSync(opcionesPath, "utf8"); // Leer archivo de opciones

const pathconsultas = path.join(__dirname, "mensajes", "consultas.txt"); // Ruta al archivo de consultas
const consultas = fs.readFileSync(pathconsultas, "utf8"); // Leer archivo de consultas

const pathcompra = path.join(__dirname, "mensajes", "compra.txt"); // Ruta al archivo de compra
const compra = fs.readFileSync(pathcompra, "utf8"); // Leer archivo de compra

const pathMenuPNG = path.join(__dirname, "documentos", "Menu.PNG"); // Ruta al archivo PDF del menú

// Función para normalizar los strings eliminando acentos y poniendo en minúsculas
const normalizeString = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Flujo de bienvenida cuando el usuario inicia la conversación
const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer(
        "Te damos la bienvenida *La Cazuela Dorada*!", // Mensaje de bienvenida
        { delay: 500 } // Retardo en la respuesta
    )
    .addAction(
        async (ctx, { gotoFlow }) => {
            return gotoFlow(flowOpciones); // Redirige automáticamente al flujo de opciones
        }
    );

// Flujo de opciones que permite al usuario elegir entre varias acciones
const flowOpciones = addKeyword("opciones")
    .addAnswer(opciones, // Mensaje con las opciones disponibles
        { capture: true }, // Captura la respuesta del usuario
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            // Validar que la respuesta sea una opción válida
            if (!["1", "2", "3", "0"].includes(ctx.body)) {
                return fallBack(
                    "Respuesta no válida, por favor selecciona una de las opciones." // Mensaje de error
                );
            }
            // Redirigir al flujo correspondiente según la opción seleccionada
            switch (ctx.body) {
                case "1":
                    return gotoFlow(flowMenuRest); // Redirige al flujo del menú del restaurante
                case "2":
                    return gotoFlow(flowReservaMesa); // Redirige al flujo de reserva de mesa
                case "3":
                    return gotoFlow(flowConsultas); // Redirige al flujo de consultas
                case "0":
                    return await flowDynamic(
                        "Puedes volver a acceder a este menú escribiendo '*Hola*'" // Mensaje de salida
                    );
            }
        }
    );

// Flujo para mostrar el menú del restaurante en formato PDF
const flowMenuRest = addKeyword(EVENTS.ACTION)
    .addAnswer('Aquí tienes nuestro menú', {
        media: pathMenuPNG // Enviar el archivo PDF del menú
    })
    .addAnswer('¿Te gustaría pedir algo? Responde con *Sí* o *No*.', 
        { capture: true },
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            try {
                // Normaliza la respuesta del usuario
                const response = normalizeString(ctx.body);

                // Verifica si la respuesta es válida
                if (response !== 'si' && response !== 'no') {
                    return fallBack("Respuesta no válida, por favor selecciona *Sí* o *No*."); // Mensaje de error
                }

                if (response === 'si') {
                    // Redirigir al flujo de pedido
                    return gotoFlow(flowMenu);
                } else {
                    await flowDynamic('Entendido, si cambias de opinión, estamos aquí para ayudarte.'); // Mensaje de confirmación
                    return gotoFlow(flowOpciones); // Redirige al flujo de opciones
                }
            } catch (error) {
                console.error("Error en el flujo de menú:", error); // Registro de errores
                return fallBack("Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo."); // Mensaje de error
            }
        });

// Variable global para almacenar datos de la reserva
let reservaDatos = {};

// Inicializar las mesas disponibles por horario (5 mesas por horario)
let mesasDisponiblesPorHorario = {"08:00 - 09:00": 5,"10:00 - 11:00": 5,"12:00 - 13:00": 5,"14:00 - 15:00": 5,"16:00 - 17:00": 5,"18:00 - 19:00": 5,"20:00 - 21:00": 5,};
// Horarios excluidos
const horariosExcluidos = ["09:00 - 10:00","11:00 - 12:00","13:00 - 14:00","15:00 - 16:00","17:00 - 18:00","19:00 - 20:00"];

// Obtener la fecha actual
const ahora = new Date();

// Flujo para procesar reservas de mesa
const flowReservaMesa = addKeyword('ACTION')
    .addAnswer(
        "Por favor, proporciona el **día** en el que quieres hacer la reserva (por ejemplo, 26 de agosto).",
        { capture: true },
        async (ctx, { flowDynamic, fallBack }) => {
            const diaReserva = ctx.body.trim();

            // Validar el formato del día y el mes
            const regex = /^\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i;

            if (!regex.test(diaReserva)) {
                return fallBack("Formato incorrecto. Por favor, proporciona el día y el mes en el formato correcto. Ejemplo: 26 de agosto.");
            }

            const dia = diaReserva.split(' de ');

            // Verificar si la fecha proporcionada ya pasó
            const fechaHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
            if (parseInt(dia) < fechaHoy.getDate() ) {
                return fallBack("La fecha proporcionada ya ha pasado. Por favor, selecciona otra fecha.");
            }

            reservaDatos.diaReserva = diaReserva;

            try {
                const pathdisponible = path.join(__dirname, "mensajes", "reservadisponible.txt");

                // Leer el archivo de disponibilidad y actualizar mesas disponibles por horario
                let mesasDisponibles = { ...mesasDisponiblesPorHorario };

                if (fs.existsSync(pathdisponible)) {
                    const fileContent = fs.readFileSync(pathdisponible, "utf8");
                    const reservas = fileContent.split('\n').filter(line => line.includes(diaReserva));

                    // Contar el número de mesas ocupadas por horario
                    const conteoMesasPorHorario = reservas.reduce((acc, reserva) => {
                        const horarioOcupado = reserva.match(/(\d{1,2}:\d{2}) a (\d{1,2}:\d{2})/);
                        if (horarioOcupado) {
                            const rangoOcupado = `${horarioOcupado[1]} - ${horarioOcupado[2]}`;
                            if (acc[rangoOcupado]) {
                                acc[rangoOcupado]++;
                            } else {
                                acc[rangoOcupado] = 1;
                            }
                        }
                        return acc;
                    }, {});

                    // Actualizar las mesas disponibles en función del conteo
                    for (const [horario, ocupadas] of Object.entries(conteoMesasPorHorario)) {
                        if (mesasDisponibles[horario] !== undefined) {
                            mesasDisponibles[horario] = mesasDisponibles[horario] - ocupadas;
                        }
                    }
                }

                // Si la fecha es hoy, filtrar los horarios pasados
                if (parseInt(dia) === fechaHoy.getDate()) {
                    const horaActual = ahora.getHours();
                    mesasDisponibles = Object.fromEntries(
                        Object.entries(mesasDisponibles).filter(([horario]) => {
                            const [inicio] = horario.split(' - ');
                            const [hora] = inicio.split(':');
                            return parseInt(hora) > horaActual;
                        })
                    );
                }

                // Eliminar horarios con 0 mesas disponibles
                mesasDisponibles = Object.fromEntries(
                    Object.entries(mesasDisponibles).filter(([_, mesas]) => mesas > 0)
                );

                // Generar el mensaje de disponibilidad
                const mensajeDisponibilidad = `
================================
*Disponibilidad de Reservas*
================================
Las siguientes franjas horarias están disponibles para el "${diaReserva}":
${Object.entries(mesasDisponibles).map(([horario, mesas]) => `${horario}: (${mesas} mesas disponibles)`).join('\n')}
                `;

                await flowDynamic(mensajeDisponibilidad);

            } catch (error) {
                console.error('Error en flowReservaMesa:', error);
                await flowDynamic("Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo más tarde.");
            }
        }
    )
    .addAnswer(
        "Por favor, proporciona los siguientes detalles para tu reserva en un solo mensaje, separados por comas:\n\n1. *Nombre completo*\n2. *Número de personas*\n3. *Horario de la reserva*\n\nEjemplo: Juan Pérez, 4 personas, 10:00",
        { capture: true },
        async (ctx, { flowDynamic, fallBack }) => {
            const userInput = ctx.body.trim();
            const diaReserva = reservaDatos.diaReserva;
    
            const [nombre, personas, horarioInicio] = userInput.split(',').map(item => item.trim());
    
            if (!nombre || !personas || !horarioInicio) {
                return fallBack("Por favor, asegúrate de proporcionar todos los detalles correctamente en el formato indicado.");
            }
    
            // Validar el formato de la hora ingresada
            const regexHora = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (!regexHora.test(horarioInicio)) {
                return fallBack("Formato de hora incorrecto. Asegúrate de ingresar la hora en formato HH:MM.");
            }
    
            // Convertir la hora de inicio a un objeto Date para poder compararlo
            const [hora, minutos] = horarioInicio.split(':').map(Number);
            const horaInicioDate = new Date();
            horaInicioDate.setHours(hora, minutos, 0, 0);
    
            // Definir el rango permitido (08:00 a 21:00)
            const horaMinima = new Date();
            horaMinima.setHours(8, 0, 0, 0);
            const horaMaxima = new Date();
            horaMaxima.setHours(21, 0, 0, 0);
    
            // Verificar si la hora está dentro del rango permitido
            if (horaInicioDate < horaMinima || horaInicioDate >= horaMaxima) {
                return fallBack("La hora ingresada no está dentro del rango permitido. El horario debe estar entre las 08:00 y las 21:00.");
            }
    
            // Verificar si el horario ingresado ya ha pasado para hoy
            const ahora = new Date();
            if(parseInt(diaReserva.split(' de ')) === ahora.getDate()){
                if (horaInicioDate <= ahora || horaInicioDate >= horaMaxima) {
                    return fallBack("El horario ingresado ya ha pasado. Por favor, elige otro horario.");
                }
            }
    
            // Sumar una hora a la hora de inicio para calcular la hora de finalización
            const horaFinalDate = new Date(horaInicioDate);
            horaFinalDate.setHours(horaFinalDate.getHours() + 1);
            const horarioFinal = horaFinalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
            // Leer el archivo de disponibilidad y validar el horario seleccionado
            const pathdisponible = path.join(__dirname, "mensajes", "reservadisponible.txt");
    
            try {
                let reservas = [];
                if (fs.existsSync(pathdisponible)) {
                    const fileContent = fs.readFileSync(pathdisponible, "utf8");
                    reservas = fileContent.split('\n').filter(line => line.includes(diaReserva) && line.includes(horarioInicio));
                }
    
                let mesasOcupadas = reservas.map(reserva => reserva.match(/Mesa (\d+)/)[1]);
                let mesaAsignada = null;
    
                for (let i = 1; i <= 5; i++) {
                    if (!mesasOcupadas.includes(i.toString())) {
                        mesaAsignada = i;
                        break;
                    }
                }
    
                const rangoHorario = `${horarioInicio} - ${horarioFinal}`;
    
                // Verificar si el horario está excluido
                if (horariosExcluidos.includes(rangoHorario)) {
                    return fallBack("El horario seleccionado no está disponible. Por favor, elige otro horario.");
                }
    
                // Presentar los detalles de la reserva y solicitar confirmación
                const detallesReserva = `
    ======================== 
    *Resumen de tu Reserva* 
    ========================
    Nombre: ${nombre}
    Número de personas: ${personas}
    Día de la reserva: ${diaReserva}
    Horario de la reserva: ${horarioInicio} - ${horarioFinal}
    Mesa asignada: ${mesaAsignada}
    `;
    
                await flowDynamic(`Aquí están los detalles de tu reserva.\n${detallesReserva}\n\n¿Deseas confirmar la reserva?`);
    
                // Guardar los detalles en una variable global para confirmar o cancelar
                reservaDatos = {nombre,personas,diaReserva,horarioInicio,horarioFinal,mesaAsignada};
            } catch (error) {
                console.error('Error en la validación del horario:', error);
                await flowDynamic("Ocurrió un error al procesar la disponibilidad del horario. Por favor, inténtalo de nuevo más tarde.");
            }
        }
    )
    
    // Paso 2: Confirmar o cancelar la reserva
    .addAnswer(
        "Responde **Sí** para confirmar o **No** para cancelar.",
        { capture: true },
        async (ctx, { flowDynamic, fallBack }) => {
            const respuesta = ctx.body.trim().toLowerCase();
    
            if (respuesta === 'sí' || respuesta === 'si') {
                // Confirmar la reserva
                const { nombre, personas, diaReserva, horarioInicio, horarioFinal, mesaAsignada } = reservaDatos;
                const numeroReserva = uuidv4();
                const fechaCreacion = new Date().toLocaleString();
    
                const detallesReserva = `
========================
*Reserva Confirmada*
========================
Número de reserva: ${numeroReserva}
Fecha de creación: ${fechaCreacion}
Nombre: ${nombre}
Número de personas: ${personas}
Día de la reserva: ${diaReserva}
Horario de la reserva: ${horarioInicio} - ${horarioFinal}
Mesa asignada: ${mesaAsignada}
    `;
    
                const disponibleReserva = `${diaReserva} de ${horarioInicio} a ${horarioFinal} - Mesa ${mesaAsignada}\n`;
                const dirPath = path.join(__dirname, "Reservas");
                const filePath = path.join(dirPath, "reserva.txt");
                const pathdisponible = path.join(__dirname, "mensajes", "reservadisponible.txt");
    
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
    
                fs.appendFileSync(filePath, detallesReserva);
                fs.appendFileSync(pathdisponible, disponibleReserva);
    
                await flowDynamic(`Tu reserva ha sido confirmada exitosamente. ¡Gracias por elegirnos! Tu número de mesa es la ${mesaAsignada}.`);
    
                // Reiniciar la variable global reservaDatos
                reservaDatos = {};
            } else if (respuesta === 'no') {
                await flowDynamic("Tu reserva ha sido cancelada.");
                
                // Reiniciar la variable global reservaDatos
                reservaDatos = {};
            } else {
                return fallBack("Respuesta no válida. Responde **Sí** para confirmar o **No** para cancelar.");
            }
        }
    );
    

// Flujo para manejar consultas mediante la API de OpenAI
const flowConsultas = addKeyword(EVENTS.ACTION)
    .addAnswer("¿Cuál es tu consulta?", { capture: true }, async (ctx, { flowDynamic, fallBack }) => {
        try {
            const prompt = consultas; // Define el prompt para la consulta
            const consulta = ctx.body; // Captura la consulta del usuario
            const answer = await chat(prompt, consulta); // Obtener respuesta de la API de OpenAI
            await flowDynamic(answer.content); // Envía la respuesta al usuario
            // Pregunta al usuario si quiere realizar otra consulta
            
        } catch (error) {
            console.error('Error en flowConsultas:', error); // Registro de errores
            await flowDynamic("Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo más tarde."); // Mensaje de error
        }
    })
    .addAnswer("¿Tienes otra consulta? Responde con *Sí* o *No*.", { capture: true }, async (ctx, { gotoFlow, flowDynamic, fallBack }) => {
        try {
            // Normaliza la respuesta del usuario para manejar variaciones de entrada
            const response = normalizeString(ctx.body);

            // Verifica si la respuesta es válida
            if (response !== 'si' && response !== 'no') {
                return fallBack("Respuesta no válida, por favor selecciona *Sí* o *No*.");
            }

            if (response === 'si') {
                // Redirige al flujo de consultas nuevamente
                return gotoFlow(flowConsultas);
            } else {
                await flowDynamic('Gracias por tu consulta. Si necesitas más ayuda, no dudes en contactarnos.');
                // Redirige al flujo de opciones
                return gotoFlow(flowOpciones);
            }
        } catch (error) {
            console.error("Error en flowConsultas:", error); // Registro de errores
            return fallBack("Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo."); // Mensaje de error
        }
    });

// Flujo para manejar pedidos del menú
globalConversation = ""; // Variable global para almacenar el historial de la conversación

const flowMenu = addKeyword(EVENTS.ACTION)
    .addAnswer("¿Qué te gustaría pedir?", { capture: true }, async (ctx, { flowDynamic, fallBack }) => {
        try {
            // Asegúrate de que ctx.session esté inicializado
            if (!ctx.session) {
                ctx.session = {};
            }

            // Actualiza la variable global con la entrada del usuario
            globalConversation += `Usuario: ${ctx.body}\n`;

            // Construir el prompt usando el historial de la conversación
            const userPrompt = `${compra}\n${globalConversation}Sistema:`;

            // Obtener la respuesta de la API de OpenAI
            const answer = await chat(userPrompt, ctx.body);

            // Actualiza el historial de la conversación con la respuesta del sistema
            globalConversation += `Sistema: ${answer.content}\n`;

            // Enviar la respuesta al usuario
            await flowDynamic(answer.content);

            // Preguntar al usuario si quiere continuar
            await flowDynamic("");
        } catch (error) {
            console.error('Error en flowMenu:', error); // Registro de errores
            await flowDynamic("Ocurrió un error al procesar tu pedido. Por favor, inténtalo de nuevo más tarde."); // Mensaje de error
        }
    })
    .addAnswer("Responde con *Sí* o *No* para continuar.", { capture: true }, async (ctx, { gotoFlow, flowDynamic, fallBack }) => {
        try {
            // Normaliza la respuesta del usuario para manejar variaciones de entrada
            const response = normalizeString(ctx.body);

            // Verifica si la respuesta es válida
            if (response !== 'si' && response !== 'no') {
                return fallBack("Respuesta no válida, por favor selecciona *Sí* o *No*.");
            }

            if (response === 'si') {
                // Redirige al flujo de menú nuevamente
                return gotoFlow(flowMenu);
            } else {
                globalConversation += `Usuario: ${ctx.body}\n`;

                // Construir el prompt usando el historial de la conversación
                const userPrompt = `${compra}\n${globalConversation}Sistema:`;

                // Obtener la respuesta de la API de OpenAI
                const answer = await chat(userPrompt, ctx.body);

                // Actualiza el historial de la conversación con la respuesta del sistema
                globalConversation += `Sistema: ${answer.content}\n`;

                // Enviar la respuesta al usuario
                await flowDynamic(answer.content);

                // Redirige al flujo de pago
                return gotoFlow(flowPago);
            }
        } catch (error) {
            console.error("Error en flowMenu:", error); // Registro de errores
            await flowDynamic("Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo."); // Mensaje de error
        }
    });

// Define el flujo de pago
const flowPago = addKeyword(EVENTS.ACTION)
    .addAnswer("Responde con *Sí* o *No* para continuar.", { capture: true }, async (ctx, { flowDynamic, fallBack }) => {
        try {
            const response = normalizeString(ctx.body); // Normaliza la respuesta del usuario para manejar variaciones de entrada

            // Procesa la respuesta del usuario
            if (response === 'si') {
                await flowDynamic("¡Compra realizada con éxito! Gracias por tu pedido."); // Mensaje de confirmación de compra
            } else if (response === 'no') {
                await flowDynamic("Gracias por tu pedido. Si necesitas más ayuda, no dudes en contactarnos."); // Mensaje de agradecimiento
            } else {
                return fallBack("Respuesta no válida, por favor selecciona *Sí* o *No*."); // Mensaje de error para respuestas no válidas
            }
        } catch (error) {
            console.error('Error en flowPago:', error); // Registro de errores
            return fallBack("Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo."); // Mensaje de error en caso de excepción
        }
    });

// Función principal para configurar y crear el bot
const main = async () => {
    try {
        // Crea un adaptador de base de datos mock para pruebas
        const adapterDB = new MockAdapter();
        
        // Crea el flujo del bot combinando todos los flujos definidos
        const adapterFlow = createFlow([flowWelcome, flowReservaMesa, flowPago, flowOpciones, flowMenu, flowMenuRest, flowConsultas]);
        
        // Crea el proveedor para conectar con WhatsApp
        const adapterProvider = createProvider(BaileysProvider);

        // Crea el bot con los adaptadores de flujo, proveedor y base de datos
        createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        });

        // Inicia el portal web para generar el código QR de acceso
        QRPortalWeb();
    } catch (error) {
        console.error('Error en la inicialización del bot:', error); // Registro de errores durante la inicialización
    }
}

// Ejecuta la función principal
main();