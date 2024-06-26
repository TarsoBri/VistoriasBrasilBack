import express from "express";
import { Client } from "./models/Client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt, { Secret } from "jsonwebtoken";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";

// Interfaces
interface ConfigEmail {
  from: {
    name: string;
    address: string;
  };
  to: string;
  subject: string;
  html: string;
}

interface DecodedTokenLogin {
  userId: string;
  iat: number;
}

const routes = express.Router();

// Create client
routes.post("/clients", async (req, res) => {
  try {
    const existingClient = await Client.findOne({ email: req.body.email });

    if (!existingClient) {
      const hashedPassword: string = await bcrypt.hash(req.body.password, 10);
      const clientData = {
        ...req.body,
        password: hashedPassword,
      };
      const client = await Client.create(clientData);
      return res.status(201).json(client);
    } else {
      throw new Error("Email já utilizado");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Login
routes.post("/clients/login", async (req, res) => {
  try {
    const client = await Client.findOne({
      email: req.body.email,
    });

    if (client === null) {
      throw new Error("Email não encontrado");
    }

    const approvedPassword = await bcrypt.compare(
      req.body.password,
      client.password as string
    );
    if (approvedPassword) {
      const userId: ObjectId = client._id;
      const token = jwt.sign({ userId }, process.env.TOKEN_PASSWORD as Secret, {
        expiresIn: "1h",
      });

      return res.status(200).json({ token });
    } else {
      throw new Error("Senha incorreta");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Confirm Login token
routes.post("/clients/login/confirm", async (req, res) => {
  try {
    const { token } = req.body;
    if (token != "") {
      const tokenDecoded = jwt.verify(
        token,
        process.env.TOKEN_PASSWORD as Secret
      );

      if (tokenDecoded && typeof tokenDecoded === "object") {
        const client = await Client.findOne({
          _id: tokenDecoded!.userId,
        });

        return res.status(201).json(client);
      } else {
        throw new Error("Token inválido");
      }
    } else {
      throw new Error("Token inválido");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Get clients
routes.get("/clients", async (req, res) => {
  try {
    const clients = await Client.find({});
    const clientsFilter = clients.map(
      ({
        firstName,
        address,
        _id,
        created_at,
        status,
        update_at,
        __v,
        surveyor,
      }) => {
        if (address) {
          const { city, state } = address;

          return {
            _id,
            __v,
            firstName,
            address: { city, state },
            status,
            update_at,
            created_at,
            surveyor,
          };
        }
      }
    );
    return res.status(200).json(clientsFilter);
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Get client by id
routes.get("/clients/:id", async (req, res) => {
  try {
    const authToken = req.headers["login-auth"];

    const id: string = req.params.id;
    const client = await Client.findOne({ _id: id });

    if (authToken && typeof authToken === "string") {
      const decodedAuthToken = jwt.verify(
        authToken,
        process.env.TOKEN_PASSWORD as Secret
      ) as DecodedTokenLogin;

      const clientSurveryor = await Client.findOne({
        _id: decodedAuthToken.userId,
      });

      if (client && clientSurveryor && clientSurveryor.surveyor) {
        const {
          __v,
          _id,
          firstName,
          email,
          address,
          phone,
          created_at,
          status,
          update_at,
          surveyor,
        } = client;
        return res.status(200).json({
          __v,
          _id,
          firstName,
          email,
          address,
          phone,
          created_at,
          status,
          update_at,
          surveyor,
        });
      } else {
        throw new Error("Acesso negado.");
      }
    } else {
      throw new Error("Token de autorização negado.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Patch client
routes.patch("/clients/:id", async (req, res) => {
  try {
    const id: string = req.params.id;
    const authToken = req.headers["login-auth"];

    if (authToken && typeof authToken === "string") {
      const decodedAuthToken = jwt.verify(
        authToken,
        process.env.TOKEN_PASSWORD as Secret
      ) as DecodedTokenLogin;
      if (decodedAuthToken.userId === id) {
        if (
          req.body.password != undefined ||
          req.body.status != undefined ||
          req.body.surveyor != undefined
        ) {
          throw new Error("Alteração de dados não autorizada");
        } else {
          const client = await Client.findByIdAndUpdate({ _id: id }, req.body, {
            new: true,
          });
          return res.status(200).json(client);
        }
      } else {
        throw new Error("Token não autoriado.");
      }
    } else {
      throw new Error("Token não encontrado.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Patch status client
routes.patch("/clients/status/:id", async (req, res) => {
  try {
    const id: string = req.params.id;
    const authToken = req.headers["login-auth"];

    if (authToken && typeof authToken === "string") {
      const decodedAuthToken = jwt.verify(
        authToken,
        process.env.TOKEN_PASSWORD as Secret
      ) as DecodedTokenLogin;

      const clientSurveryor = await Client.findOne({
        _id: decodedAuthToken.userId,
      });

      if (clientSurveryor && clientSurveryor.surveyor) {
        const client = await Client.findByIdAndUpdate({ _id: id }, req.body, {
          new: true,
        });
        return res.status(200).json(client);
      } else {
        throw new Error("Usuário não autorizado.");
      }
    } else {
      throw new Error("Token não encontrado.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

//Patch password client
routes.patch("/clients/changePassword/:id", async (req, res) => {
  try {
    const id: string = req.params.id;
    const client = await Client.findOne({ _id: id });

    if (client === null) {
      throw new Error("Usuário não encontrado.");
    }

    let approvedPasswordHashed: boolean = false;
    let approvedPassword: boolean = false;

    if (req.body.code && req.body.hashedCode) {
      approvedPasswordHashed = await compareCodes(
        req.body.code,
        req.body.hashedCode
      );
      if (!approvedPasswordHashed) {
        throw new Error("Código está incorreto.");
      }
    } else {
      approvedPassword = await compareCodes(
        req.body.password,
        client.password as string
      );
    }

    if (approvedPassword || approvedPasswordHashed) {
      const hashedNewPassword: string = await bcrypt.hash(
        req.body.newPassword,
        10
      );
      const clientWithNewPassword = await Client.findByIdAndUpdate(
        { _id: id },
        {
          password: hashedNewPassword,
          update_at: req.body.update_at,
        },
        {
          new: true,
        }
      );

      return res.status(200).json(clientWithNewPassword);
    } else {
      throw new Error("Sua senha está incorreta.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

routes.post("/sendMailRecovery", async (req, res) => {
  try {
    const { email } = req.body;
    const client = await Client.findOne({ email });

    if (client === null) {
      throw new Error("Email ainda não cadastrado.");
    }

    if (process.env.EMAIL && process.env.PASSWORD_EMAIL) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD_EMAIL,
        },
      });

      const code = crypto.randomBytes(3).toString("hex");
      console.log(code);

      const hashedCode: string = await bcrypt.hash(code, 10);

      const configEmail: ConfigEmail = {
        from: {
          name: "Vistorias Brasil",
          address: process.env.EMAIL,
        },
        to: email,
        subject: "Redefinição de senha",
        html: `<p>Olá ${client.firstName}, Você solicitou a redfinição de senha no Vistorais Brasil, utilize o código de validação a seguir para redefinir sua senha: </p> 
        <p> <strong>${code}</strong> </p>`,
      };

      transporter.sendMail(configEmail, (err, data) => {
        if (err) {
          throw new Error("Falha ao enviar o email.");
        } else {
          res.status(200).json({ hashedCode, email, id: client._id });
        }
      });
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

// Confirm Recovery
routes.post("/sendMailRecovery/confirm", async (req, res) => {
  try {
    const approvedCode = await compareCodes(req.body.code, req.body.hashedCode);

    if (approvedCode) {
      return res.status(200).send("APPROVED");
    } else {
      throw new Error("Código de validação não autorizado.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

const compareCodes = async (
  code: string,
  hashedCode: string
): Promise<boolean> => {
  return await bcrypt.compare(code, hashedCode);
};

export { routes };
