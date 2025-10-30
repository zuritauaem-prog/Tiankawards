const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const StellarSdk = require('stellar-sdk');
const nodemailer = require('nodemailer'); // Para el envío de correos
const { v4: uuidv4 } = require('uuid'); // Para generar tokens únicos

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public')); // Servir archivos estáticos

// --- Configuración de Nodemailer (¡IMPORTANTE! Configura esto) ---
// Para pruebas locales, puedes usar Ethereal Mail (https://ethereal.email/)
// Es un servicio de prueba gratuito que te da credenciales SMTP temporales.
// O configura tu propio SMTP (ej. Gmail, SendGrid, Mailgun)
const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email', // Ejemplo para Ethereal.email
    port: 587,
    secure: false, // true para 465, false para otros puertos como 587
    auth: {
        user: 'tu_email_ethereal@ethereal.email', // Tu dirección de Ethereal o tu SMTP user
        pass: 'tu_contraseña_ethereal',     // Tu contraseña de Ethereal o tu SMTP pass
    },
});

// --- Simulación de Base de Datos (en memoria para pruebas locales) ---
const users = []; // Usuarios registrados
const pendingVerifications = []; // Verificaciones pendientes por correo
/*
Estructura de usuario:
{
    id: "uuid",
    email: "user@example.com",
    username: "miusuario",
    accountType: "cliente", // o "empresa"
    stellarPublicKey: "G...",
    stellarSecretKey: "S...", // ¡ALTO RIESGO EN PRODUCCIÓN!
    isVerified: false,
    createdAt: Date
}
Estructura de verificación pendiente:
{
    email: "user@example.com",
    token: "uuid",
    expiresAt: Date,
    accountType: "cliente",
    username: "miusuario"
}
*/

// --- Simulación de Smart Contract Stellar (Soroban) ---
// En un entorno real, esta sería una interacción real con tu contrato.
// Aquí, simplemente simularemos que un usuario es "registrado" en el contrato.
async function registerUserInSmartContract(publicKey, accountType, username) {
    console.log(`[Smart Contract Simulado] Registrando ${accountType} ${username} con PublicKey: ${publicKey}`);
    // Aquí iría la lógica para llamar a tu contrato Soroban:
    // 1. Cargar el contrato.
    // 2. Construir la transacción con la llamada a la función de registro.
    // 3. Firmar la transacción con la clave de tu servicio (o una clave designada del contrato).
    // 4. Enviar la transacción a la red Stellar.
    // Ejemplo (pseudocódigo):
    // const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
    // const contractId = "tu_contract_id";
    // const contract = new StellarSdk.Contract(contractId);
    // const tx = new StellarSdk.TransactionBuilder(...)
    //    .addOperation(contract.call('registerUser', { publicKey: publicKey, type: accountType, name: username }))
    //    .build();
    // tx.sign(StellarSdk.Keypair.fromSecret(process.env.CONTRACT_SIGNER_SECRET)); // Firma del contrato
    // await server.submitTransaction(tx);
    console.log("[Smart Contract Simulado] Usuario registrado exitosamente.");
    return { success: true, message: "Usuario registrado en Smart Contract Soroban." };
}

// --- Rutas del Backend ---

// 1. Ruta de Registro (inicia el proceso de verificación por correo)
app.post('/api/register-initiate', async (req, res) => {
    const { email, username, accountType } = req.body;

    if (!email || !username || !accountType) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }
    if (users.some(u => u.email === email)) {
        return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
    }

    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 3600 * 1000); // Token válido por 1 hora

    pendingVerifications.push({ email, username, accountType, token: verificationToken, expiresAt });
    console.log('Verificación pendiente creada:', { email, username, accountType, token: verificationToken });

    // Enviar correo de verificación
    const verificationLink = `http://localhost:${port}/api/verify-email?token=${verificationToken}`;

    try {
        await transporter.sendMail({
            from: '"TinakAward Support" <support@tinakaward.com>',
            to: email,
            subject: 'Verifica tu cuenta de TinakAward',
            html: `
                <p>Hola ${username},</p>
                <p>Gracias por registrarte en TinakAward. Por favor, haz clic en el siguiente enlace para verificar tu correo y completar el registro:</p>
                <p><a href="${verificationLink}">Verificar Cuenta</a></p>
                <p>Este enlace expirará en 1 hora.</p>
                <p>Si no solicitaste esto, puedes ignorar este correo.</p>
                <p>Saludos,</p>
                <p>El equipo de TinakAward</p>
            `,
        });
        console.log(`Correo de verificación enviado a ${email}`);
        res.status(200).json({ message: 'Se ha enviado un correo de verificación a tu dirección. Por favor, revisa tu bandeja de entrada.' });
    } catch (error) {
        console.error('Error al enviar el correo de verificación:', error);
        res.status(500).json({ message: 'Error al enviar el correo de verificación. Inténtalo de nuevo.' });
    }
});

// 2. Ruta para verificar el correo (Magic Link)
app.get('/api/verify-email', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Token de verificación faltante.');
    }

    const verificationEntryIndex = pendingVerifications.findIndex(entry => entry.token === token);

    if (verificationEntryIndex === -1) {
        return res.status(404).send('Token de verificación inválido o ya usado.');
    }

    const verificationEntry = pendingVerifications[verificationEntryIndex];

    if (new Date() > verificationEntry.expiresAt) {
        pendingVerifications.splice(verificationEntryIndex, 1); // Eliminar token expirado
        return res.status(400).send('Token de verificación expirado. Por favor, inicia el registro de nuevo.');
    }

    // --- Generar par de claves Stellar y registrar en Smart Contract ---
    const keypair = StellarSdk.Keypair.random();
    const stellarPublicKey = keypair.publicKey();
    const stellarSecretKey = keypair.secret(); // ¡ALTO RIESGO! Ver notas de seguridad.

    try {
        // Simular registro en el Smart Contract
        await registerUserInSmartContract(stellarPublicKey, verificationEntry.accountType, verificationEntry.username);

        const newUser = {
            id: uuidv4(),
            email: verificationEntry.email,
            username: verificationEntry.username,
            accountType: verificationEntry.accountType,
            stellarPublicKey: stellarPublicKey,
            stellarSecretKey: stellarSecretKey, // Guardar la secretKey (para la demo)
            isVerified: true,
            createdAt: new Date()
        };
        users.push(newUser);

        // Eliminar la entrada de verificación pendiente
        pendingVerifications.splice(verificationEntryIndex, 1);
        console.log('Usuario verificado y registrado:', newUser);
        console.log('Usuarios actuales:', users);

        // Redirigir al usuario al login o directamente al dashboard con un mensaje de éxito
        res.redirect(`/success-redirect.html?email=${newUser.email}&accountType=${newUser.accountType}&username=${newUser.username}`);

    } catch (error) {
        console.error('Error durante el proceso de verificación o registro en Smart Contract:', error);
        res.status(500).send('Error interno al completar el registro. Inténtalo de nuevo.');
    }
});

// 3. Ruta de Login (ahora solo con email y sin wallet en el frontend)
app.post('/api/login', async (req, res) => {
    const { email } = req.body; // El login ahora es solo con email

    if (!email) {
        return res.status(400).json({ message: 'El correo electrónico es requerido para el login.' });
    }

    const user = users.find(u => u.email === email && u.isVerified);

    if (!user) {
        // En un entorno real, podrías diferenciar entre "usuario no existe" y "usuario no verificado"
        return res.status(401).json({ message: 'Correo electrónico no encontrado o no verificado.' });
    }

    // --- Simulación de Login con Smart Contract (Opcional, para mayor seguridad) ---
    // Aquí podrías pedirle al backend que interactúe con el SC para "logear" al usuario.
    // O, más comúnmente, si el SC es solo para registro, el backend gestiona la sesión.

    // En un entorno real, aquí generarías un JWT
    res.status(200).json({
        message: 'Login exitoso.',
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            accountType: user.accountType,
            stellarPublicKey: user.stellarPublicKey
            // NO envíes la secretKey al frontend en producción
        }
    });
});

// Ruta para obtener la lista de clientes
app.get('/api/clients', (req, res) => {
    const clients = users.filter(user => user.accountType === 'cliente');
    res.status(200).json({ clients });
});

// Ruta de redirección para mostrar mensaje de éxito después de verificación
app.get('/success-redirect.html', (req, res) => {
    res.sendFile(__dirname + '/public/success-redirect.html');
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Backend de TinakAward escuchando en http://localhost:${port}`);
    console.log('Sirviendo archivos estáticos desde /public');
});