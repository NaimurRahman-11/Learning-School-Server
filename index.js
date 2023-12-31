const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)


//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }

  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yg6iolk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();



    const usersCollection = client.db('LearningDB').collection('users');
    const classesCollection = client.db('LearningDB').collection('classes');
    const selectedClassesCollection = client.db('LearningDB').collection('selectedClasses');
    const cartCollection = client.db("LearningDB").collection("carts");
    const paymentCollection = client.db("LearningDB").collection("payments");



    //Payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    


    app.get('/payments/:email', async (req, res) => {
      const email = req.params.email;

      try {
        const user = await paymentCollection.findOne({ email });

        if (user) {
          const classes = user.cartItems;
          res.send(classes);
        } else {
          res.status(404).send({ error: 'User not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Internal server error' });
      }
    });


    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().sort({ date: -1 }).toArray();
      res.send(result);
    });




    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token });
    })


    //user related api
    app.post('/users', async (req, res) => {
      const user = req.body;

      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'User Already Exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })


    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })


    app.delete('/users/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const filter = { _id: new ObjectId(id) };

        const result = await usersCollection.deleteOne(filter);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });


    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }



      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })


    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }



      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })





    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })


    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })



    app.post('/classes', verifyJWT, async (req, res) => {
      const { className, classPhotoURL, instructorName, instructorEmail, availableSeats, price, enrolledStudents } = req.body;
      const status = 'pending';

      const newClass = {
        className,
        classPhotoURL,
        instructorName,
        instructorEmail,
        availableSeats,
        price,
        status,
        enrolledStudents
      };

      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });


    app.get('/allclasses', async (req, res) => {
      try {
        const classes = await classesCollection.find().toArray();
        res.send(classes);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });

    app.patch('/allclasses/:classId', async (req, res) => {
      try {
        const classId = req.params.classId;
        const { status } = req.body;

        const filter = { _id: new ObjectId(classId) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });


    //Logged in user specific email class data's
    app.get('/classes', async (req, res) => {
      console.log(req.query.email);

      let query = {};
      if (req.query?.email) {
        query = { instructorEmail: req.query.email }
      }

      const result = await classesCollection.find(query).toArray();
      res.send(result);
    })


    app.patch('/classes/:classId', async (req, res) => {
      try {
        const classId = req.params.classId;
        const { status } = req.body;

        const filter = { _id: new ObjectId(classId) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });

    app.patch('/approved-classes/:classItemId', async (req, res) => {
      try {
        const itemId = req.params.classItemId;
        const { enrolledStudents, availableSeats } = req.body;
    
        const filter = { _id: new ObjectId(itemId) };
    
        const updateDoc = {
          $inc: {
            enrolledStudents: parseInt(enrolledStudents),
            availableSeats: parseInt(availableSeats),
          },
        };
    
        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });
    
    
    



    app.get('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await classesCollection.findOne(query);
      res.send(result);
    })




    //Approved classes
    app.get('/approved-classes', async (req, res) => {
      try {
        const approvedClasses = await classesCollection.find({ status: 'approved' }).toArray();
        res.send(approvedClasses);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });

    app.get('/top-classes', async (req, res) => {
      try {
        const approvedClasses = await classesCollection.find({ status: 'approved' }).sort({ enrolledStudents: -1 }).toArray();
        res.send(approvedClasses);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });

    app.get('/approved-classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await classesCollection.findOne(query);
      res.send(result);
    })


    app.post('/selected-classes', async (req, res) => {
      const item = req.body;
      const result = await selectedClassesCollection.insertOne(item);
      res.send(result);
    })








    app.post("/carts", async (req, res) => {
      const cartItem = req.body;

      try {
        const existingCartItem = await cartCollection.findOne({
          classItemId: cartItem.classItemId,
          email: cartItem.email
        });

        if (existingCartItem) {
          res.status(400).json({ message: "Item Already Selected" });
          return;
        }

        const session = await client.startSession();
        session.startTransaction();

        try {
          const options = { session };

          // Update enrolledStudents in the classes collection
          // await classesCollection.updateOne(
          //   { _id: new ObjectId(cartItem.classItemId) },
          //   { $inc: { enrolledStudents: 1, availableSeats: -1 } },
          //   options
          // );

          // Insert the cart item
          const result = await cartCollection.insertOne(cartItem, options);

          await session.commitTransaction();
          session.endSession();

          res.json({ insertedId: result.insertedId });
        } catch (error) {
          await session.abortTransaction();
          session.endSession();

          console.error(error);
          res.status(500).json({ message: "Failed to add item to cart." });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to add item to cart." });
      }
    });




    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deleteResult = await cartCollection.deleteMany(query)

      res.send({ insertedId: insertResult.insertedId, deleteResult });
    });
    
    
    




    app.get("/carts", async (req, res) => {
      const userEmail = req.query.email;

      try {
        const selectedItems = await cartCollection.find({ email: userEmail }).toArray();
        res.json(selectedItems);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to retrieve selected items from cart." });
      }
    });


    app.delete('/carts/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const filter = { _id: new ObjectId(id) };

        const result = await cartCollection.deleteOne(filter);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred' });
      }
    });








    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Learning is in progress')
})


app.listen(port, () => {
  console.log(`Learning on the port ${port}`);
})