import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  //   host: "smtp.hostinger.com",
  //   secure: true,
  // auth: {
  //   user: 'myvizlogic@vizlogicindia.com',
  //   pass: 'P@ss1234k',
  // },

    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SENDINBLUE_USER, // Sendinblue SMTP user from environment variable
      pass: process.env.SENDINBLUE_PASS,
    },
});

export const sendMail = async (data:{email:string,subject:string, text:string}) => {
  const { email, subject, text } = data;
  console.log(email,'imsid')
  try {
    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: email,
      subject: subject,
      text: text,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
  } catch (error) {
    console.log("Error occurred:", error);
  }
};

