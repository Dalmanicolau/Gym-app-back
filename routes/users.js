import express from 'express';
import bcrypt from "bcryptjs";
import User from "../models/User.js"
import generateAndSetCookie from "../utils/generateToken.js"

const router = express.Router();

router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            username,
            password: hashedPassword,
        });

        if (newUser) {
            generateAndSetCookie(newUser._id, res);
            await newUser.save();
            res.status(201).json({
                username: newUser.username
            })
        } else {
            res.status(400).json({ error: "Invalid user data"})
        }         
    } catch (error) {
        console.log("Error ins signup controller", error.message);
        res.status(500).json({ error: "Internal Server Error"})
    }
});

router.post('/login', async (req, res) => {
    try {
        console.log("data recibida", req.body);
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        const isPasswordCorrect = await bcrypt.compare(
            password,
            user?.password || ""
        );
        if (!user || !isPasswordCorrect) {
            return res.status(400).json ({ error: "Invalid username o password"});
        }
        generateAndSetCookie(user._id, res);
        res.status(200).json({
            _id: user._id,
            username: user.username,
        })
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({error: "Internal Server Error"});
    }
});

router.post('/', async (req, res) => {
    try{
        res.cookie("jwt", "", { maxAge: 0});
        res.status(200).json({ message: "Logged out succesfully"});
    } catch (error) {
        console.log ("Error in logout controller", error.message);
    res.status(500).json({ error: "Internal Server Error" });
    }
})

export default router;
