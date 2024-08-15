// Importar dependencias necesarias para interactuar con la API de OpenAI
const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config(); // Cargar variables de entorno desde el archivo .env

/**
 * Función para obtener una respuesta de la API de OpenAI
 * @param {string} prompt - El mensaje inicial que define el contexto de la conversación
 * @param {string} text - El texto del usuario para el que se requiere una respuesta
 * @returns {Promise<string>} - La respuesta generada por la API de OpenAI o un mensaje de error
 */
const chat = async (prompt, text) => {
    try {
        // Configuración de la API de OpenAI con la clave de API
        const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY, // Clave de API cargada desde las variables de entorno
        });
        
        // Crear una instancia del cliente de OpenAI
        const openai = new OpenAIApi(configuration);
        
        // Solicitar una respuesta a la API de OpenAI usando el modelo gpt-3.5-turbo
        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo", // Modelo de lenguaje a utilizar
            messages: [
                { role: "system", content: prompt }, // Mensaje del sistema para establecer el contexto
                { role: "user", content: text },    // Mensaje del usuario para la consulta
            ],
        });
        
        // Devolver el mensaje de la respuesta generada
        return completion.data.choices[0].message;
    } catch (err) {
        // Manejar errores durante la solicitud a la API de OpenAI
        console.error("Error al conectar con OpenAI:", err); // Mostrar error en consola
        return "ERROR"; // Devolver un mensaje de error en caso de fallo
    }
};

module.exports = chat; // Exportar la función para ser utilizada en otros módulos
