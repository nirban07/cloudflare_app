import { Hono } from 'hono';
import { env } from 'hono/adapter';
import { string, z } from 'zod';

// import { PrismaClient } from '@prisma/client';
import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import jwt from '@tsndr/cloudflare-worker-jwt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "PRISMA ACCELERATE URL HERE"
    }
  }
}).$extends(withAccelerate())
// console.log(prisma)
const app = new Hono();


app.get("/", (c) => {
  return c.text("Glad you could make it try these endpoints: /users/signup, /users/signin")
})

// user schema
const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string(),
})


app.post('/users/signup', async (c) => {
  let { username, password, email } = await c.req.json()
  let user = UserSchema.safeParse({ email, password, username })
  if (!user.success) {
    return c.text("invalid username or password")
  }
  try {
    const newuser = await prisma.user.create({
      data: {
        username,
        email,
        password
      }
    })
  } catch (err) {
    console.log(err)
    return c.text("username or email already exists")
  }
  return c.text("user registered")
});

app.post("/users/signin", async (c) => {
  let { email, password } = await c.req.json();



  // check if registered
  const user = await prisma.user.findUnique({
    where: {
      email: email
    }
  })

  if (user == null) {
    return c.text("user not present")
  }
  const token = await jwt.sign({ email, password }, c.env?.MY_SECRET as string)

  return c.json({
    token: token
  })

})


app.get("/posts", async (c) => {
  try {
    let publicPosts = await prisma.blog.findMany({
      where: {
        published: true
      },
      take: 10
    })
    return c.json({
      publicPosts
    })

  } catch (err) {
    console.log(err)
  }
})
app.use("/posts", async (c, next) => {
  let { MY_SECRET } = env(c, "workerd")
  if (c.req.method == "POST") {
    const token = c.req.header("authorization")
    const words = token?.split(" ")
    if (words == undefined) {
      return c.text("invalid bearer")
    }
    let jwttoken = words[1]
    let verified = await jwt.verify(jwttoken, MY_SECRET as string)
    if (!verified) {
      return c.text("cannot verify")
    }
    await next()
  }
})


app.post("/posts", async (c) => {
  let { title, body } = await c.req.json()
  let bearer = c.req.header("authorization")
  let words = bearer?.split(" ")
  if (!words) {
    return c.text("needs token")
  }
  let token = words[1]
  let { header, payload } = jwt.decode(token)
  let { email }: any = payload
  const user = await prisma.user.findUnique({
    where: {
      email: email,
    },
  });
  if (!user) {
    return c.text("user not found")
  }
  const newBlogPost = await prisma.blog.create({
    data: {
      title: title,
      body: body,
      authorId: user.id, // Assign the user's ID as the authorId
    },
  });

  return c.text("blog recieved")
})

app.get("/posts/:id", async (c) => {
  let bearer = c.req.header("authorization")
  let words = bearer?.split(" ")
  if (!words) {
    return c.text("needs token")
  }
  let token = words[1]
  let { header, payload } = jwt.decode(token)
  let { email }: any = payload
  let postId = c.req.param()
  console.log(postId)

  let blog = await prisma.blog.findMany({
    where: {
      id: Number(postId.id)
    }
  })
  console.log(blog)
  return c.json(blog)
})

export default app;