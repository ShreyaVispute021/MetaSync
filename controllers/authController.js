const bcrypt = require("bcryptjs");
const User = require("../models/User");

exports.showRegister = (req, res) => {
  res.render("auth/register", { error: null });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).render("auth/register", {
        error: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash,
    });

    req.session.userId = user._id;
    req.session.userName = user.name;

    res.redirect("/");
  } catch (error) {
    res.status(500).render("auth/register", {
      error: "Registration failed. Please try again.",
    });
  }
};

exports.showLogin = (req, res) => {
  res.render("auth/login", { error: null });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).render("auth/login", {
        error: "Invalid email or password.",
      });
    }

    req.session.userId = user._id;
    req.session.userName = user.name;

    res.redirect("/");
  } catch (error) {
    res.status(500).render("auth/login", {
      error: "Login failed. Please try again.",
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
};