import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RegisteredWith, UpdateUserDto } from "../payloads/user.payload";
import { UserRepository } from "../repositories/user.repository";
import { RegisterPayload } from "../payloads/register.payload";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { User } from "@src/modules/common/models/user.model";
import {
  EarlyAccessPayload,
  ResetPasswordPayload,
} from "../payloads/resetPassword.payload";
import * as nodemailer from "nodemailer";
import { InsertOneResult, ObjectId, WithId } from "mongodb";
import { createHmac } from "crypto";
import { ErrorMessages } from "@src/modules/common/enum/error-messages.enum";
import hbs = require("nodemailer-express-handlebars");
import path from "path";
import { TeamService } from "./team.service";
import { ContextService } from "@src/modules/common/services/context.service";
import { EmailService } from "@src/modules/common/services/email.service";
export interface IGenericMessageBody {
  message: string;
}
/**
 * User Service
 */
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly teamService: TeamService,
    private readonly contextService: ContextService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Fetches a user from database by UUID
   * @param {string} id
   * @returns {Promise<IUser>} queried user data
   */
  async getUserById(id: string): Promise<WithId<User>> {
    const data = await this.userRepository.getUserById(id);
    return data;
  }

  /**
   * Fetches a user from database by username
   * @param {string} email
   * @returns {Promise<IUser>} queried user data
   */
  async getUserByEmail(email: string): Promise<WithId<User>> {
    return await this.userRepository.getUserByEmail(email.toLowerCase());
  }

  /**
   * Fetches a user from database by username
   * @param {string} email
   * @returns {Promise<IUser>} queried user data
   */
  async getUserRegisterStatus(email: string): Promise<RegisteredWith> {
    const user = await this.userRepository.getUserByEmail(email);
    if (user?.authProviders) {
      // Registered with google auth
      return {
        registeredWith: "google",
      };
    } else if (user?.email) {
      // registered with email
      return {
        registeredWith: "email",
      };
    } else {
      return {
        registeredWith: "unknown",
      };
    }
  }

  /**
   * Fetches a user by their email and hashed password
   * @param {string} email
   * @param {string} password
   * @returns {Promise<IUser>} queried user data
   */
  async getUserByEmailAndPass(
    email: string,
    password: string,
  ): Promise<WithId<User>> {
    return await this.userRepository.getUserByEmailAndPass(email, password);
  }

  /**
   * Create a user with RegisterPayload fields
   * @param {RegisterPayload} payload user payload
   * @returns {Promise<IUser>} created user data
   */
  async createUser(payload: RegisterPayload) {
    payload.email = payload.email.toLowerCase();
    const user = await this.getUserByEmail(payload.email);
    if (user) {
      throw new BadRequestException(
        "The account with the provided email currently exists. Please choose another one.",
      );
    }
    const createdUser = await this.userRepository.createUser(payload);

    const tokenPromises = [
      this.authService.createToken(createdUser.insertedId),
      this.authService.createRefreshToken(createdUser.insertedId),
    ];
    const [accessToken, refreshToken] = await Promise.all(tokenPromises);
    const data = {
      accessToken,
      refreshToken,
    };
    const firstName = await this.getFirstName(payload.name);
    const teamName = {
      name: firstName + this.configService.get("app.defaultTeamNameSuffix"),
      firstTeam: true,
    };
    await this.teamService.create(teamName);
    await this.sendSignUpEmail(firstName, payload.email);
    return data;
  }

  /**
   * Edit User data
   * @param {userId} payload
   * @param {UpdateUserDto} payload
   * @returns {Promise<IUser>} mutated User data
   */
  async updateUser(
    userId: string,
    payload: Partial<UpdateUserDto>,
  ): Promise<WithId<User>> {
    const data = await this.userRepository.updateUser(userId, payload);
    return data;
  }

  /**
   * Delete user given a email
   * @param {userId} param
   * @returns {Promise<IGenericMessageBody>}
   */
  async deleteUser(userId: string) {
    const data: any = await this.userRepository.deleteUser(userId);
    return data;
  }
  async sendVerificationEmail(
    resetPasswordDto: ResetPasswordPayload,
  ): Promise<void> {
    const userDetails = await this.getUserByEmail(resetPasswordDto.email);
    if (!userDetails) {
      throw new UnauthorizedException(ErrorMessages.BadRequestError);
    }
    const transporter = this.emailService.createTransporter();

    const verificationCode = this.generateEmailVerificationCode().toUpperCase();

    const mailOptions = {
      from: this.configService.get("app.senderEmail"),
      to: resetPasswordDto.email,
      text: "Sparrow Password Reset",
      template: "verifyEmail",
      context: {
        name: userDetails.name.split(" ")[0],
        verificationCode,
        sparrowEmail: this.configService.get("support.sparrowEmail"),
        sparrowWebsite: this.configService.get("support.sparrowWebsite"),
        sparrowWebsiteName: this.configService.get(
          "support.sparrowWebsiteName",
        ),
      },
      subject: `Reset your Sparrow account password`,
    };
    const promise = [
      transporter.sendMail(mailOptions),
      this.userRepository.updateVerificationCode(
        resetPasswordDto.email,
        verificationCode,
      ),
    ];
    await Promise.all(promise);
  }

  async sendWelcomeEmail(earlyAccessDto: EarlyAccessPayload): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.configService.get("app.mailHost"),
      port: this.configService.get("app.mailPort"),
      secure: this.configService.get("app.mailSecure") === "true",
      auth: {
        user: this.configService.get("app.userName"),
        pass: this.configService.get("app.senderPassword"),
      },
    });
    const handlebarOptions = {
      viewEngine: {
        defaultLayout: "",
      },
      viewPath: path.resolve(__dirname, "..", "..", "views"),
    };
    transporter.use("compile", hbs(handlebarOptions));

    const mailOptions = {
      from: this.configService.get("app.senderEmail"),
      to: earlyAccessDto.email,
      subject: `Welcome to Sparrow `,
      template: "welcomeEmail",
    };
    const promise = [
      transporter.sendMail(mailOptions),
      this.userRepository.saveEarlyAccessEmail(earlyAccessDto.email),
    ];
    await Promise.all(promise);
  }
  async logoutUser(userId: string, refreshToken: string): Promise<void> {
    const user = await this.userRepository.findUserByUserId(
      new ObjectId(userId),
    );
    const hashrefreshToken = user.refresh_tokens.filter((token) => {
      if (createHmac("sha256", refreshToken).digest("hex") === token) {
        return token;
      }
    });
    if (!hashrefreshToken) {
      throw new BadRequestException();
    }
    await this.userRepository.deleteRefreshToken(userId, hashrefreshToken[0]);
    return;
  }

  async createGoogleAuthUser(
    oauthId: string,
    name: string,
    email: string,
  ): Promise<InsertOneResult> {
    const createdUser = await this.userRepository.createGoogleAuthUser(
      oauthId,
      name,
      email,
    );
    const user = {
      _id: createdUser.insertedId,
      name: name,
      email: email,
    };
    this.contextService.set("user", user);
    const firstName = await this.getFirstName(name);
    const teamName = {
      name: firstName + this.configService.get("app.defaultTeamNameSuffix"),
      firstTeam: true,
    };
    await this.teamService.create(teamName);
    return createdUser;
  }

  async verifyVerificationCode(
    email: string,
    verificationCode: string,
    expireTime: number,
  ): Promise<void> {
    const user = await this.getUserByEmail(email);
    if (!user?.isVerificationCodeActive) {
      throw new UnauthorizedException(ErrorMessages.Unauthorized);
    }
    if (user?.verificationCode !== verificationCode.toUpperCase()) {
      throw new UnauthorizedException(ErrorMessages.Unauthorized);
    }
    if (
      (Date.now() - user.verificationCodeTimeStamp.getTime()) / 1000 >
      expireTime
    ) {
      throw new UnauthorizedException(ErrorMessages.VerificationCodeExpired);
    }
    return;
  }

  async expireVerificationCode(email: string): Promise<void> {
    await this.userRepository.expireVerificationCode(email);
    return;
  }

  async refreshVerificationCode(email: string): Promise<string> {
    const verificationCode = this.generateEmailVerificationCode().toUpperCase();
    await this.userRepository.updateVerificationCode(email, verificationCode);
    return verificationCode;
  }

  async updatePassword(email: string, password: string): Promise<void> {
    const user = await this.getUserByEmailAndPass(email, password);

    if (user) {
      throw new UnauthorizedException(ErrorMessages.PasswordExist);
    }
    await this.userRepository.updatePassword(email, password);
    await this.expireVerificationCode(email);
    return;
  }

  generateEmailVerificationCode(): string {
    return (Math.random() + 1).toString(36).substring(2, 8);
  }

  async getFirstName(name: string): Promise<string> {
    const nameArray = name.split(" ");
    return nameArray[0];
  }

  async sendSignUpEmail(firstname: string, email: string): Promise<void> {
    const transporter = this.emailService.createTransporter();
    const mailOptions = {
      from: this.configService.get("app.senderEmail"),
      to: email,
      text: "Sparrow Welcome",
      template: "signUpEmail",
      context: {
        name: firstname,
        sparrowEmail: this.configService.get("support.sparrowEmail"),
        sparrowWebsite: this.configService.get("support.sparrowWebsite"),
        sparrowWebsiteName: this.configService.get(
          "support.sparrowWebsiteName",
        ),
      },
      subject: `Welcome to Sparrow - Elevate Your REST API Management Effortlessly!`,
    };
    const promise = [transporter.sendMail(mailOptions)];
    await Promise.all(promise);
  }
}
