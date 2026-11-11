import express from 'express';
import bcrypt from "bcryptjs";
import User, { ROLES } from "../models/User.js"
import generateAndSetCookie from "../utils/generateToken.js"
import { protectRoute, requireAdmin, getUserFromRequest, loginRateLimit, clearLoginAttempts, validateObjectId } from "../middleware/auth.js";

const router = express.Router();

const hashPassword = async (password) => bcrypt.hash(password, await bcrypt.genSalt(10));

const validateCredentials = (username, password) => {
    if (typeof username !== 'string' || username.trim().length < 3) return "El usuario debe tener al menos 3 caracteres.";
    if (typeof password !== 'string' || password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
    return null;
};

// Crear usuario. Solo se permite sin sesión si todavía no existe ningún usuario
// (primer administrador); después, solo un usuario logueado puede crear otros.
router.post('/signup', async (req, res) => {
    try {
        const usersCount = await User.countDocuments({});
        const requester = await getUserFromRequest(req);
        if (usersCount > 0 && !requester) {
            return res.status(401).json({ message: "Solo un usuario logueado puede crear nuevos usuarios." });
        }
        if (requester?.role === 'recepcion') {
            return res.status(403).json({ message: "Solo un administrador puede crear usuarios." });
        }

        const { username, password } = req.body;
        const invalid = validateCredentials(username, password);
        if (invalid) return res.status(422).json({ message: invalid });

        const cleanUsername = username.trim();
        if (await User.findOne({ username: cleanUsername })) {
            return res.status(400).json({ message: "Ese nombre de usuario ya existe." });
        }

        const newUser = await User.create({
            username: cleanUsername,
            password: await hashPassword(password),
            // El primer usuario siempre es administrador.
            role: requester && ROLES.includes(req.body.role) ? req.body.role : 'admin',
        });

        // Solo se inicia sesión automáticamente con el primer usuario.
        const token = requester ? undefined : generateAndSetCookie(newUser._id, res);
        res.status(201).json({ _id: newUser._id, username: newUser.username, role: newUser.role, token });
    } catch (error) {
        console.error("Error en signup:", error.message);
        res.status(500).json({ message: "Error interno del servidor" })
    }
});

router.post('/login', loginRateLimit, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ message: "Usuario o contraseña incorrectos." });
        }
        const user = await User.findOne({ username: username.trim() });
        const isPasswordCorrect = await bcrypt.compare(password, user?.password || "");
        if (!user || !isPasswordCorrect) {
            return res.status(400).json({ message: "Usuario o contraseña incorrectos." });
        }
        clearLoginAttempts(req);
        const token = generateAndSetCookie(user._id, res);
        res.status(200).json({
            _id: user._id,
            username: user.username,
            role: user.role,
            token,
        })
    } catch (error) {
        console.error("Error en login:", error.message);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

const logout = (req, res) => {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Sesión cerrada correctamente" });
};
router.post('/logout', logout);

// Usuario de la sesión actual
router.get('/me', protectRoute, (req, res) => {
    res.status(200).json({ _id: req.user._id, username: req.user.username, role: req.user.role });
});

// Listado de usuarios (sin contraseñas)
router.get('/', protectRoute, async (req, res) => {
    try {
        const users = await User.find({}, 'username role createdAt').sort({ username: 1 }).lean();
        res.status(200).json(users);
    } catch (error) {
        console.error("Error al listar usuarios:", error.message);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// Cambiar la contraseña propia
router.put('/password', protectRoute, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(422).json({ message: "La nueva contraseña debe tener al menos 6 caracteres." });
        }
        const user = await User.findById(req.user._id);
        const ok = await bcrypt.compare(String(currentPassword || ""), user.password);
        if (!ok) return res.status(400).json({ message: "La contraseña actual no es correcta." });
        user.password = await hashPassword(newPassword);
        await user.save();
        res.status(200).json({ message: "Contraseña actualizada." });
    } catch (error) {
        console.error("Error al cambiar contraseña:", error.message);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// Cambiar el rol de otro usuario
router.put('/:id/role', protectRoute, requireAdmin, validateObjectId(), async (req, res) => {
    try {
        if (String(req.user._id) === req.params.id) {
            return res.status(400).json({ message: "No podés cambiar tu propio rol." });
        }
        if (!ROLES.includes(req.body.role)) return res.status(422).json({ message: "Rol inválido." });
        const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select('username role');
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        res.status(200).json(user);
    } catch (error) {
        console.error("Error al cambiar rol:", error.message);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// Eliminar un usuario (no se puede eliminar a uno mismo)
router.delete('/:id', protectRoute, requireAdmin, validateObjectId(), async (req, res) => {
    try {
        if (String(req.user._id) === req.params.id) {
            return res.status(400).json({ message: "No podés eliminar tu propio usuario." });
        }
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Usuario no encontrado" });
        res.status(200).json({ _id: deleted._id });
    } catch (error) {
        console.error("Error al eliminar usuario:", error.message);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

export default router;
