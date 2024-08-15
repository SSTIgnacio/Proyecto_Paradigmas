// Importar dependencias necesarias
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot');
require("dotenv").config(); // Cargar variables de entorno desde el archivo .env

const QRPortalWeb = require('@bot-whatsapp/portal'); // Importar módulo para generar el QR de acceso web
const BaileysProvider = require('@bot-whatsapp/provider/baileys'); // Proveedor para conectar con WhatsApp usando Baileys
const MockAdapter = require('@bot-whatsapp/database/mock'); // Adaptador de base de datos mock para pruebas
const path = require("path"); // Módulo para trabajar con rutas de archivos
const fs = require("fs"); // Módulo para operaciones de sistema de archivos
const { v4: uuidv4 } = require('uuid'); // Módulo para generar identificadores únicos
const chat = require("./chatGPT"); // Importar módulo para interactuar con la API de OpenAI

// Leer contenido de archivos de texto que contienen respuestas y mensajes
const opcionesPath = path.join(__dirname, "mensajes", "opciones.txt");
const opciones = fs.readFileSync(opcionesPath, "utf8");

const pathConsultas = path.join(__dirname, "mensajes", "promptConsultas.txt");
const promptConsultas = fs.readFileSync(pathConsultas, "utf8");

const pathmenu = path.join(__dirname, "mensajes", "menu.txt");
const menu = fs.readFileSync(pathmenu, "utf8");

// Normaliza los strings
const normalizeString = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Flujo de bienvenida cuando el usuario inicia la conversación
const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer(
        "Te damos la bienvenida *La Cazuela Dorada*!",
        { delay: 500 } // Retardo en la respuesta
    )
    .addAction(
        async (ctx, { gotoFlow }) => {
            return gotoFlow(flowOpciones); // Redirige automáticamente al flujo de opciones
        }
    );

// Flujo de opciones que permite al usuario elegir entre varias acciones
const flowOpciones = addKeyword("opciones")
    .addAnswer(opciones,
        { capture: true }, // Captura la respuesta del usuario
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            // Validar que la respuesta sea una opción válida
            if (!["1", "2", "3", "0"].includes(ctx.body)) {
                return fallBack(
                    "Respuesta no válida, por favor selecciona una de las opciones."
                );
            }
            // Redirigir al flujo correspondiente según la opción seleccionada
            switch (ctx.body) {
                case "1":
                    return gotoFlow(flowMenuRest);
                case "2":
                    return gotoFlow(flowReservaMesa);
                case "3":
                    return gotoFlow(flowConsultas);
                case "0":
                    return await flowDynamic(
                        "Saliendo... Puedes volver a acceder a este menú escribiendo '*Opciones*'"
                    );
            }
        }
    );

// Flujo para mostrar el menú del restaurante en formato PDF
const flowMenuRest = addKeyword(EVENTS.ACTION)
    .addAnswer('PDF', {
        media: "Cambiar URL del archivo debe ir a la carpeta documentos" // Ruta al archivo PDF del menú
    }).addAnswer('Aquí tienes nuestro menú, ¿Te gustaría pedir algo? Responde con *Si* o *No*.', 
        { capture: true },
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            // Normaliza la respuesta del usuario
            const response = normalizeString(ctx.body);

            // Verifica si la respuesta es válida
            if (response !== 'si' && response !== 'no') {
                return fallBack("Respuesta no válida, por favor selecciona *Sí* o *No*.");
            }

            if (response === 'si') {
                // Redirigir al flujo de pedido
                return gotoFlow(flowMenu);
            } else {
                await flowDynamic('Entendido, si cambias de opinión, estamos aquí para ayudarte.');
                return gotoFlow(flowOpciones);
            }
        });

// Flujo para procesar reservas de mesa
const flowReservaMesa = addKeyword(EVENTS.ACTION)
    .addAnswer(
        "Por favor, proporciona los siguientes detalles para tu reserva en un solo mensaje, separados por comas:\n\n1. **Nombre completo**\n2. **Número de personas**\n3. **Fecha y hora de la reserva**\n\nEjemplo: Juan Pérez, 4 personas, 15 de agosto a las 19:00",
        { capture: true }, 
        async (ctx, { flowDynamic, fallBack }) => {
            const userInput = ctx.body.trim(); // Captura la entrada del usuario

            // Procesar la entrada del usuario
            const [nombre, personas, fechaHora] = userInput.split(',').map(item => item.trim());

            // Validar que todos los campos estén presentes
            if (!nombre || !personas || !fechaHora) {
                return fallBack("Por favor, asegúrate de proporcionar todos los detalles correctamente en el formato indicado.");
            }

            // Generar un número de reserva único y la fecha actual
            const numeroReserva = uuidv4(); // Genera un identificador único
            const fechaCreacion = new Date().toLocaleString(); // Fecha actual en formato local

            // Compila todos los detalles en una variable con formato
            const detallesReserva = `
            ================================
            ** Reserva de Mesa **
            ================================
            Número de reserva: ${numeroReserva}
            Fecha de creación: ${fechaCreacion}

            Nombre: ${nombre}
            Número de personas: ${personas}
            Fecha y hora de la reserva: ${fechaHora}
            `;

            const filePath = 'Cambiar URL del archivo debe ir a la carpeta Reservas'; // Ruta donde se guardará el archivo

            // Agregar el contenido al archivo sin sobrescribir
            try {
                fs.appendFileSync(filePath, detallesReserva); // Usa appendFileSync para añadir al final del archivo
                await flowDynamic("Tu reserva ha sido guardada exitosamente. ¡Gracias por elegirnos!");
            } catch (error) {
                console.error('Error al guardar el archivo:', error);
                await flowDynamic("Hubo un problema al guardar tu reserva. Inténtalo de nuevo.");
            }
        }
    );

// Flujo para manejar consultas mediante la API de OpenAI
const flowConsultas = addKeyword(EVENTS.ACTION)
    .addAnswer("¿Cuál es tu consulta?", { capture: true }, async (ctx, ctxFn) => {
        const prompt = promptConsultas;
        const consulta = ctx.body;
        const answer = await chat(prompt, consulta); // Obtener respuesta de la API de OpenAI
        await ctxFn.flowDynamic(answer.content);
    });

// Flujo para manejar pedidos del menú
const flowMenu = addKeyword(EVENTS.ACTION)
    .addAnswer("¿Qué te gustaría pedir?", { capture: true }, async (ctx, { flowDynamic }) => {
        const prompt = menu;
        const consulta = ctx.body;
        const answer = await chat(prompt, consulta); // Obtener respuesta de la API de OpenAI
        await flowDynamic(answer.content);
    });

// Función principal para configurar y crear el bot
const main = async () => {
    const adapterDB = new MockAdapter(); // Adaptador de base de datos mock para pruebas
    const adapterFlow = createFlow([flowWelcome, flowReservaMesa, flowOpciones, flowMenu, flowMenuRest, flowConsultas]); // Crear flujo del bot
    const adapterProvider = createProvider(BaileysProvider); // Proveedor para conectar con WhatsApp

    // Crear el bot con los adaptadores de flujo, proveedor y base de datos
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    QRPortalWeb(); // Iniciar el portal web para generar QR de acceso
}

// Ejecutar la función principal
main();